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

const { updateMatch, sendReply, rescanRelease } = await import('../src/resolvers/index.js');

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
    expect((await updateMatch({ versionId: '1', requestKey: 'HELP-1', draft: '   ' })).ok).toBe(false);
    expect((await updateMatch({ versionId: '1', requestKey: 'help 1' })).ok).toBe(false);
    expect((await updateMatch({ versionId: '1:x', requestKey: 'HELP-1' })).ok).toBe(false);
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

  test('refuses a draft that is only the agent placeholder when the agent has no name', async () => {
    kv.set('match:1:HELP-1', match({ draft: '{agentFirstName}' }));
    const base = happyJira();
    jira.handle = (method, path, body) => (path === '/rest/api/3/myself' ? { json: { displayName: '' } } : base(method, path, body));
    expect(await sendReply({ versionId: '1', requestKey: 'HELP-1' })).toEqual({ ok: false, message: 'Not sent: the reply is empty' });
    expect(posts()).toHaveLength(0);
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
