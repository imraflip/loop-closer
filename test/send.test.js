import { describe, test, expect, vi, beforeEach } from 'vitest';

// In-memory KVS.
const kv = new Map();
vi.mock('@forge/kvs', () => ({
  kvs: {
    get: async (key) => kv.get(key),
    set: async (key, value) => void kv.set(key, structuredClone(value)),
    query: () => {
      let prefix = '';
      const q = {
        where: (_f, cond) => ((prefix = cond), q),
        limit: () => q,
        cursor: () => q,
        getMany: async () => ({ results: [...kv].filter(([k]) => k.startsWith(prefix)).map(([key, value]) => ({ key, value })) }),
      };
      return q;
    },
  },
  WhereConditions: { beginsWith: (p) => p },
}));

// Fake Jira: each test sets `jira.handle(method, path, body)` -> { status, json }.
const jira = { calls: [], handle: null };
vi.mock('@forge/api', () => {
  const requestJira = async (path, opts = {}) => {
    const method = opts.method || 'GET';
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    jira.calls.push({ method, path, body });
    const { status = 200, json = {} } = jira.handle(method, path, body) || {};
    return { ok: status >= 200 && status < 300, status, json: async () => json, text: async () => JSON.stringify(json) };
  };
  return {
    default: { asUser: () => ({ requestJira }), asApp: () => ({ requestJira }) },
    route: (s, ...v) => s.reduce((a, p, i) => a + p + (v[i] ?? ''), ''),
  };
});

// Mocked inbox checks: service desk agent, then Jira admin (the real Jira calls are tested in settings.test.js).
const agent = vi.hoisted(() => ({ yes: true, admin: false }));
vi.mock('../src/lib/jira.js', async (orig) => ({
  ...(await orig()),
  isServiceDeskAgent: async () => agent.yes,
  isJiraAdmin: async () => agent.admin,
}));

const { updateMatch, sendReply, rescanRelease, getMatches, getOneMatch } = await import('../src/resolvers/index.js');

const SETTINGS = { jiraProjectKey: 'LOOP', jsmProjectKey: 'HELP', autoResolve: false, resolveStatusName: 'Resolved' };
const match = (extra = {}) => ({
  requestKey: 'HELP-1', bugKey: 'LOOP-1', bugSummary: 'PDF export hangs', versionId: '1', releaseName: '2.4', linked: true, score: 1,
  reasons: ['linked to LOOP-1'], customerName: 'Ana Lima', customerAccountId: 'acc-1', requestSummary: 'PDF never finishes',
  status: 'drafted', draft: 'Hi Ana,\n\nFixed.\n\nThanks,\n{agentFirstName}', draftSource: 'template', sentAt: null, ...extra,
});
const stored = () => kv.get('match:1:HELP-1');
const posts = () => jira.calls.filter((c) => c.method === 'POST');

// Default Jira: open request, agent "Rafli Permana", comment 201, transition list + 204.
function happyJira({ category = 'INDETERMINATE', requestTypeId = '10', commentStatus = 201, transitions = [{ id: '5', name: 'Resolved' }] } = {}) {
  return (method, path) => {
    if (path === '/rest/api/3/myself') return { json: { displayName: 'Rafli Permana' } };
    if (method === 'GET' && path === '/rest/servicedeskapi/request/HELP-1') return { json: { requestTypeId: requestTypeId ?? undefined, currentStatus: { status: 'Waiting for support', statusCategory: category } } };
    if (method === 'POST' && path.endsWith('/comment')) return { status: commentStatus, json: commentStatus === 201 ? { id: '99' } : { errorMessage: 'No permission' } };
    if (method === 'GET' && path.includes('/transition')) return { json: { values: transitions } };
    if (method === 'POST' && path.endsWith('/transition')) return { status: 204 };
    return { status: 404, json: { errorMessage: 'unexpected call' } };
  };
}

beforeEach(() => {
  kv.clear();
  jira.calls = [];
  jira.handle = happyJira();
  kv.set('settings', SETTINGS);
  kv.set('release:1', { versionId: '1', name: '2.4', bugKeys: ['LOOP-1'], counts: {} });
  kv.set('match:1:HELP-1', match());
});

describe('placeholder in the inbox display', () => {
  const withMyself = (myself) => {
    const base = happyJira();
    return (method, path, body) => (path === '/rest/api/3/myself' ? myself : base(method, path, body));
  };

  test('getMatches shows the signed-in user\'s first name; the stored draft keeps the placeholder', async () => {
    const res = await getMatches({ versionId: '1' });
    expect(res.data.tabs.waiting[0].draft).toBe('Hi Ana,\n\nFixed.\n\nThanks,\nRafli');
    expect(stored().draft).toContain('{agentFirstName}');
  });

  test('getMatches signs "Support" when the name cannot be read, and still loads', async () => {
    for (const myself of [{ status: 500, json: { errorMessage: 'boom' } }, { json: { displayName: '' } }]) {
      jira.handle = withMyself(myself);
      const res = await getMatches({ versionId: '1' });
      expect(res.ok).toBe(true);
      expect(res.data.tabs.waiting[0].draft).toBe('Hi Ana,\n\nFixed.\n\nThanks,\nSupport');
    }
  });

  test('updateMatch "Use template" returns the new draft with the name filled, never braces', async () => {
    const res = await updateMatch({ versionId: '1', requestKey: 'HELP-1', resetDraft: true });
    expect(res.ok).toBe(true);
    expect(res.data.draft).not.toMatch(/[{}]/);
    expect(res.data.draft).toMatch(/\nRafli$/);
  });
});

describe('shared words for old matches in the inbox', () => {
  test('getMatches rebuilds full words for a sent, skipped or not related match with no reasonWords, saving nothing', async () => {
    const base = { linked: false, score: 0.4, reasons: ['logg', 'setting'], requestSummary: 'Logging settings vanish', bugSummary: 'Logging resets' };
    kv.set('match:1:HELP-1', match({ ...base, status: 'sent', sentAt: '2026-11-14T10:00:00.000Z' }));
    kv.set('match:1:HELP-2', match({ ...base, requestKey: 'HELP-2', status: 'skipped' }));
    kv.set('match:1:HELP-3', match({ ...base, requestKey: 'HELP-3', status: 'not_related' }));
    const before = structuredClone([...kv]);

    const { tabs } = (await getMatches({ versionId: '1' })).data;
    for (const m of [...tabs.sent, ...tabs.other]) expect(m.reasonWords).toEqual({ logg: 'logging', setting: 'settings' });
    expect(tabs.sent).toHaveLength(1);
    expect(tabs.other).toHaveLength(2);
    expect([...kv]).toEqual(before); // nothing written, statuses unchanged
  });
});

describe('getMatch (one match, for the Rovo check)', () => {
  test('returns only status, draft (name filled), draftSource and updatedAt; saves nothing', async () => {
    const before = structuredClone([...kv]);
    expect(await getOneMatch({ versionId: '1', requestKey: 'HELP-1' })).toEqual({
      ok: true,
      data: { requestKey: 'HELP-1', status: 'drafted', draft: 'Hi Ana,\n\nFixed.\n\nThanks,\nRafli', draftSource: 'template', updatedAt: null },
    });
    expect([...kv]).toEqual(before);
  });

  test('unknown or bad keys fail cleanly', async () => {
    expect((await getOneMatch({ versionId: '1', requestKey: 'HELP-99' })).ok).toBe(false);
    expect((await getOneMatch({ versionId: 'x', requestKey: 'HELP-1' })).ok).toBe(false);
  });
});

describe('updateMatch', () => {
  test('saves an edited draft as "edited" and recounts nothing when status is unchanged', async () => {
    const res = await updateMatch({ versionId: '1', requestKey: 'HELP-1', draft: '  New text  ' });
    expect(res.ok).toBe(true);
    expect(stored()).toMatchObject({ draft: 'New text', draftSource: 'edited', status: 'drafted' });
    expect(res.data).not.toHaveProperty('customerAccountId');
  });

  test('same text keeps the draft source; a waiting match becomes drafted', async () => {
    kv.set('match:1:HELP-1', match({ status: 'waiting' }));
    await updateMatch({ versionId: '1', requestKey: 'HELP-1', draft: match().draft });
    expect(stored()).toMatchObject({ draftSource: 'template', status: 'drafted' });
  });

  test('skip and not related update the status and release counts', async () => {
    await updateMatch({ versionId: '1', requestKey: 'HELP-1', status: 'skipped' });
    expect(stored().status).toBe('skipped');
    expect(kv.get('release:1').counts).toMatchObject({ skipped: 1, drafted: 0 });
    await updateMatch({ versionId: '1', requestKey: 'HELP-1', status: 'not_related' });
    expect(kv.get('release:1').counts).toMatchObject({ notRelated: 1, skipped: 0 });
  });

  test('never changes a sent match; rejects bad status, empty draft, bad keys', async () => {
    kv.set('match:1:HELP-1', match({ status: 'sent' }));
    expect((await updateMatch({ versionId: '1', requestKey: 'HELP-1', draft: 'x' })).ok).toBe(false);
    expect((await updateMatch({ versionId: '1', requestKey: 'HELP-1', status: 'skipped' })).ok).toBe(false);
    expect(stored().status).toBe('sent');
    kv.set('match:1:HELP-1', match());
    expect((await updateMatch({ versionId: '1', requestKey: 'HELP-1', status: 'sent' })).ok).toBe(false);
    expect((await updateMatch({ versionId: '1', requestKey: 'help 1' })).ok).toBe(false);
    expect((await updateMatch({ versionId: '1:x', requestKey: 'HELP-1' })).ok).toBe(false);
  });

  test('clearing the draft saves it as waiting with no draft, and recounts', async () => {
    kv.set('match:1:HELP-1', match({ draft: 'hhhhhhh', draftSource: 'edited' }));
    for (const draft of ['', '   \n ']) {
      const res = await updateMatch({ versionId: '1', requestKey: 'HELP-1', draft });
      expect(res.ok).toBe(true);
      expect(stored()).toMatchObject({ status: 'waiting', draft: null, draftSource: null });
    }
    expect(kv.get('release:1').counts).toMatchObject({ waiting: 1, drafted: 0 });
    expect((await sendReply({ versionId: '1', requestKey: 'HELP-1' })).message).toBe('Not sent: the reply is empty');
  });

  test('resetDraft replaces an edited draft with the template for the current tone', async () => {
    kv.set('match:1:HELP-1', match({ draft: 'hhhhhhh', draftSource: 'edited' }));
    let res = await updateMatch({ versionId: '1', requestKey: 'HELP-1', resetDraft: true });
    expect(res.ok).toBe(true);
    expect(stored()).toMatchObject({ status: 'drafted', draftSource: 'template' });
    expect(stored().draft).toMatch(/^Hi Ana,\n\nGood news: the problem you told us about, "PDF never finishes"/);
    expect(stored().draft).toContain('{agentFirstName}');

    kv.set('settings', { ...SETTINGS, tone: 'formal' });
    kv.set('match:1:HELP-1', match({ status: 'waiting', draft: null, draftSource: null }));
    res = await updateMatch({ versionId: '1', requestKey: 'HELP-1', resetDraft: true });
    expect(stored().draft).toMatch(/^Dear Ana,/);
    expect(kv.get('release:1').counts).toMatchObject({ drafted: 1, waiting: 0 });
  });

  test('resetDraft is refused for sent, skipped and not related matches', async () => {
    for (const status of ['sent', 'skipped', 'not_related']) {
      kv.set('match:1:HELP-1', match({ status, draft: 'kept' }));
      expect((await updateMatch({ versionId: '1', requestKey: 'HELP-1', resetDraft: true })).ok).toBe(false);
      expect(stored().draft).toBe('kept');
    }
  });

  test('trims a long draft to 1500 characters', async () => {
    await updateMatch({ versionId: '1', requestKey: 'HELP-1', draft: 'a'.repeat(2000) });
    expect(stored().draft).toHaveLength(1500);
  });
});

describe('sendReply', () => {
  test('posts a PUBLIC comment with the agent name filled in, then marks sent', async () => {
    const res = await sendReply({ versionId: '1', requestKey: 'HELP-1' });
    expect(res.ok).toBe(true);
    const [comment] = posts();
    expect(comment.path).toBe('/rest/servicedeskapi/request/HELP-1/comment');
    expect(comment.body).toEqual({ body: 'Hi Ana,\n\nFixed.\n\nThanks,\nRafli', public: true });
    expect(stored()).toMatchObject({ status: 'sent', draft: comment.body.body });
    expect(stored().sentAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(kv.get('release:1').counts).toMatchObject({ sent: 1, drafted: 0 });
    expect(posts()).toHaveLength(1); // autoResolve off: no transition
    expect(res.data.warning).toBeNull();
  });

  test('closed request: clear error, nothing posted, match unchanged', async () => {
    jira.handle = happyJira({ category: 'DONE' });
    const res = await sendReply({ versionId: '1', requestKey: 'HELP-1' });
    expect(res).toEqual({ ok: false, message: 'Not sent: HELP-1 is already closed (Waiting for support)' });
    expect(posts()).toHaveLength(0);
    expect(stored().status).toBe('drafted');
  });

  test('work item without a request type: clear error, nothing posted', async () => {
    jira.handle = happyJira({ requestTypeId: null });
    const res = await sendReply({ versionId: '1', requestKey: 'HELP-1' });
    expect(res.ok).toBe(false);
    expect(res.message).toBe('Not sent: HELP-1: this request has no request type; create it via the portal (Raise a request)');
    expect(posts()).toHaveLength(0);
    expect(stored().status).toBe('drafted');
  });

  test('refuses an empty or whitespace-only draft without calling Jira', async () => {
    for (const draft of ['', '   ', '\n\t \n', null]) {
      kv.set('match:1:HELP-1', match({ draft }));
      expect(await sendReply({ versionId: '1', requestKey: 'HELP-1' })).toEqual({ ok: false, message: 'Not sent: the reply is empty' });
    }
    expect(jira.calls).toHaveLength(0);
  });

  test('refuses a draft that is only the agent placeholder, without calling Jira', async () => {
    kv.set('match:1:HELP-1', match({ draft: '{agentFirstName}' }));
    expect(await sendReply({ versionId: '1', requestKey: 'HELP-1' })).toEqual({ ok: false, message: 'Not sent: the reply is empty' });
    expect(jira.calls).toHaveLength(0);
  });

  test('"Support" fallback: name unreadable or empty, the reply still goes out signed "Support"', async () => {
    const base = happyJira();
    for (const myself of [{ status: 500, json: { errorMessage: 'boom' } }, { json: { displayName: '' } }]) {
      kv.set('match:1:HELP-1', match());
      jira.calls = [];
      jira.handle = (method, path, body) => (path === '/rest/api/3/myself' ? myself : base(method, path, body));
      const res = await sendReply({ versionId: '1', requestKey: 'HELP-1' });
      expect(res.ok).toBe(true);
      expect(posts()[0].body.body).toBe('Hi Ana,\n\nFixed.\n\nThanks,\nSupport');
    }
  });

  test('no braces in any posted comment: template, edited and Rovo drafts, with and without a name', async () => {
    const drafts = [
      ['template', 'Hi Ana,\n\nFixed.\n\nThanks,\n{agentFirstName}'],
      ['edited', 'Hi Ana, sorted now.\n{ agentFirstName }'],
      ['rovo', 'Dear Ana,\n\nResolved in 2.4.\n\nKind regards,\n{AgentFirstName}'],
    ];
    const base = happyJira();
    for (const displayName of ['Rafli Permana', '']) {
      for (const [draftSource, draft] of drafts) {
        kv.set('match:1:HELP-1', match({ draft, draftSource }));
        jira.handle = (method, path, b) => (path === '/rest/api/3/myself' ? { json: { displayName } } : base(method, path, b));
        expect((await sendReply({ versionId: '1', requestKey: 'HELP-1' })).ok).toBe(true);
      }
    }
    const bodies = posts().map((p) => p.body.body);
    expect(bodies).toHaveLength(6);
    for (const body of bodies) expect(body).not.toMatch(/[{}]|agentFirstName/i);
    expect(bodies.filter((b) => b.endsWith('Rafli'))).toHaveLength(3);
    expect(bodies.filter((b) => b.endsWith('Support'))).toHaveLength(3);
  });

  test('comment API not 201: "Not sent", match stays drafted', async () => {
    jira.handle = happyJira({ commentStatus: 403 });
    const res = await sendReply({ versionId: '1', requestKey: 'HELP-1' });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/^Not sent: Post reply failed: 403 No permission/);
    expect(stored()).toMatchObject({ status: 'drafted', sentAt: null });
  });

  test('refuses sent, skipped and not related matches without calling Jira', async () => {
    for (const status of ['sent', 'skipped', 'not_related']) {
      kv.set('match:1:HELP-1', match({ status }));
      expect((await sendReply({ versionId: '1', requestKey: 'HELP-1' })).ok).toBe(false);
    }
    expect(jira.calls).toHaveLength(0);
  });

  test('autoResolve: posts the transition whose name matches the setting', async () => {
    kv.set('settings', { ...SETTINGS, autoResolve: true, resolveStatusName: 'resolved' });
    jira.handle = happyJira({ transitions: [{ id: '3', name: 'Escalate' }, { id: '5', name: 'Resolved' }] });
    const res = await sendReply({ versionId: '1', requestKey: 'HELP-1' });
    expect(res.data.warning).toBeNull();
    expect(posts().map((c) => c.path)).toEqual(['/rest/servicedeskapi/request/HELP-1/comment', '/rest/servicedeskapi/request/HELP-1/transition']);
    expect(posts()[1].body).toEqual({ id: '5' });
  });

  test('autoResolve with no matching transition: still sent, with a warning', async () => {
    kv.set('settings', { ...SETTINGS, autoResolve: true });
    jira.handle = happyJira({ transitions: [{ id: '3', name: 'Escalate' }] });
    const res = await sendReply({ versionId: '1', requestKey: 'HELP-1' });
    expect(res.ok).toBe(true);
    expect(stored().status).toBe('sent');
    expect(res.data.warning).toMatch(/^Reply sent, but HELP-1 was not resolved: no transition named "Resolved"/);
  });
});

describe('rescanRelease', () => {
  const bug = { key: 'LOOP-9', fields: { summary: 'Search slow on mobile', description: null, components: [], issuelinks: [{ outwardIssue: { key: 'HELP-7' } }] } };
  const request = { key: 'HELP-7', fields: { summary: 'Search is slow on my phone', description: null, components: [], reporter: { displayName: 'Gita Sari', accountId: 'acc-7' }, created: '2026-11-01T10:00:00.000+0000' } };

  // Version 7 has one bug linked to one open request.
  const scanJira = (bugs) => (method, path, body) => {
    if (method === 'GET' && path === '/rest/api/3/version/7') return { json: { id: '7', name: '2.5', releaseDate: '2026-11-10' } };
    if (method === 'POST' && path === '/rest/api/3/search/jql') {
      if (body.jql.includes('fixVersion')) return { json: { issues: bugs, isLast: true } };
      return { json: { issues: [request], isLast: true } };
    }
    return { status: 404, json: { errorMessage: 'unexpected call' } };
  };

  test('scans as the user, saves drafted matches and returns the release summary', async () => {
    jira.handle = scanJira([bug]);
    const res = await rescanRelease({ versionId: '7' });
    expect(res.ok).toBe(true);
    expect(res.data).toMatchObject({ versionId: '7', name: '2.5', bugCount: 1, waiting: 1, sent: 0, total: 1 });
    expect(kv.get('match:7:HELP-7')).toMatchObject({ status: 'drafted', linked: true, draftSource: 'template' });
    expect(posts().every((c) => c.path === '/rest/api/3/search/jql')).toBe(true); // reads only, nothing posted to customers
  });

  test('a rescan keeps a sent match as sent', async () => {
    jira.handle = scanJira([bug]);
    await rescanRelease({ versionId: '7' });
    kv.set('match:7:HELP-7', { ...kv.get('match:7:HELP-7'), status: 'sent', sentAt: '2026-11-12T00:00:00.000Z' });
    const res = await rescanRelease({ versionId: '7' });
    expect(kv.get('match:7:HELP-7').status).toBe('sent');
    expect(res.data).toMatchObject({ sent: 1, waiting: 0 });
  });

  test('fills the draft of a waiting match that has none (saved before drafts existed)', async () => {
    jira.handle = scanJira([bug]);
    kv.set('match:7:HELP-7', { requestKey: 'HELP-7', versionId: '7', status: 'waiting', draft: null, draftSource: null, sentAt: null });
    kv.set('release:7', { versionId: '7', name: '2.5', bugKeys: ['LOOP-9'], counts: { waiting: 1 } });
    const res = await rescanRelease({ versionId: '7' });
    expect(kv.get('match:7:HELP-7')).toMatchObject({ status: 'drafted', draftSource: 'template' });
    expect(kv.get('match:7:HELP-7').draft).toMatch(/^Hi Gita,/);
    expect(kv.get('release:7').counts).toMatchObject({ waiting: 0, drafted: 1 });
    expect(res.data).toMatchObject({ waiting: 1, total: 1 });
  });

  test('leaves a sent match and an edited draft unchanged', async () => {
    const other = { ...request, key: 'HELP-8', fields: { ...request.fields, summary: 'Search on mobile is slow' } };
    const twoLinks = { ...bug, fields: { ...bug.fields, issuelinks: [{ outwardIssue: { key: 'HELP-7' } }, { outwardIssue: { key: 'HELP-8' } }] } };
    jira.handle = (method, path, body) =>
      method === 'POST' && path === '/rest/api/3/search/jql' && !body.jql.includes('fixVersion')
        ? { json: { issues: [request, other], isLast: true } }
        : scanJira([twoLinks])(method, path, body);
    const sent = { requestKey: 'HELP-7', versionId: '7', status: 'sent', draft: 'Hi Gita, sent text', draftSource: 'template', sentAt: '2026-11-12T00:00:00.000Z' };
    const edited = { requestKey: 'HELP-8', versionId: '7', status: 'drafted', draft: 'My own careful words', draftSource: 'edited', sentAt: null };
    kv.set('match:7:HELP-7', sent);
    kv.set('match:7:HELP-8', edited);
    await rescanRelease({ versionId: '7' });
    expect(kv.get('match:7:HELP-7')).toEqual(sent);
    expect(kv.get('match:7:HELP-8')).toMatchObject({ status: 'drafted', draft: 'My own careful words', draftSource: 'edited' });
    expect(kv.get('release:7').counts).toMatchObject({ sent: 1, drafted: 1 });
  });

  test('a cleared edited draft gets a fresh template on rescan', async () => {
    jira.handle = scanJira([bug]);
    await rescanRelease({ versionId: '7' });
    await updateMatch({ versionId: '7', requestKey: 'HELP-7', draft: 'hhhhhhh' });
    await rescanRelease({ versionId: '7' });
    expect(kv.get('match:7:HELP-7')).toMatchObject({ draft: 'hhhhhhh', draftSource: 'edited' }); // edits are kept
    await updateMatch({ versionId: '7', requestKey: 'HELP-7', draft: '' });
    await rescanRelease({ versionId: '7' });
    expect(kv.get('match:7:HELP-7')).toMatchObject({ status: 'drafted', draftSource: 'template' });
    expect(kv.get('match:7:HELP-7').draft).toMatch(/^Hi Gita,/);
  });

  test('scanning twice creates no duplicate matches', async () => {
    jira.handle = scanJira([bug]);
    await rescanRelease({ versionId: '7' });
    const keysAfterFirst = [...kv.keys()].filter((k) => k.startsWith('match:7:')).sort();
    const res = await rescanRelease({ versionId: '7' });
    expect([...kv.keys()].filter((k) => k.startsWith('match:7:')).sort()).toEqual(keysAfterFirst);
    expect(keysAfterFirst).toEqual(['match:7:HELP-7']);
    expect(res.data.total).toBe(1);
  });

  test('no fixed bugs: clear message and nothing saved', async () => {
    jira.handle = scanJira([]);
    expect(await rescanRelease({ versionId: '7' })).toEqual({ ok: false, message: 'No fixed bugs found for this release' });
    expect(kv.has('release:7')).toBe(false);
  });

  test('bad version id', async () => {
    expect((await rescanRelease({ versionId: 'abc' })).ok).toBe(false);
    expect(jira.calls).toHaveLength(0);
  });
});
