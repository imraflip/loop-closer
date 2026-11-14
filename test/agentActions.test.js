import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

const kv = new Map();
vi.mock('@forge/kvs', () => ({
  kvs: {
    get: async (key) => kv.get(key),
    query: () => {
      let prefix = '';
      const q = {
        where: (_field, cond) => ((prefix = cond), q),
        limit: () => q,
        cursor: () => q,
        getMany: async () => ({
          results: [...kv].filter(([k]) => k.startsWith(prefix)).map(([key, value]) => ({ key, value })),
        }),
      };
      return q;
    },
  },
  WhereConditions: { beginsWith: (p) => p },
}));

const actions = await import('../src/actions/agentActions.js');
const { getWaitingCustomers, getReleaseMatches, getDraftContext, getLoopStatus, findRelease, daysWaiting, hideEmails, customerFirstName } = actions;

const putRelease = (versionId, name, releasedAt) => kv.set(`release:${versionId}`, { versionId, name, releasedAt });
const putMatch = (versionId, releaseName, requestKey, fields) =>
  kv.set(`match:${versionId}:${requestKey}`, {
    requestKey,
    versionId,
    releaseName,
    bugKey: 'LOOP-1',
    bugSummary: 'PDF export fails',
    customerName: 'Eko Prasetyo',
    customerAccountId: 'acc-secret',
    requestSummary: 'Cannot export my report to PDF',
    linked: false,
    score: 0.42,
    reasons: ['pdf', 'export', 'report'],
    status: 'waiting',
    draft: 'Hi Eko',
    draftSource: 'template',
    ...fields,
  });

const EMAIL = 'eko.prasetyo@example.com';
const noEmails = (result) => expect(JSON.stringify(result)).not.toMatch(/@|acc-secret/);

beforeEach(() => {
  kv.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-15T10:00:00Z'));
  kv.set('settings', { jiraProjectKey: 'LOOP', jsmProjectKey: 'HELP', tone: 'formal' });
  putRelease('100', '2.3', '2026-10-01');
  putRelease('200', '2.4', '2026-11-12');
  putMatch('100', '2.3', 'HELP-20', { customerName: 'Old Customer', status: 'drafted' });
  putMatch('200', '2.4', 'HELP-5', { customerName: EMAIL });
  putMatch('200', '2.4', 'HELP-10', { customerName: 'Dewi Lestari', status: 'drafted', linked: true, score: 1 });
  putMatch('200', '2.4', 'HELP-3', { customerName: 'Chen Wei', status: 'sent' });
  putMatch('200', '2.4', 'HELP-11', { customerName: 'Rina', status: 'not_related' });
});
afterEach(() => vi.useRealTimers());

describe('pure helpers', () => {
  test('findRelease ignores case and spaces; empty name picks the newest', () => {
    const list = [{ name: '2.3', releasedAt: '2026-10-01' }, { name: 'V2.4', releasedAt: '2026-11-12' }];
    expect(findRelease(list, ' v2.4 ').name).toBe('V2.4');
    expect(findRelease(list, '').name).toBe('V2.4');
    expect(findRelease(list, '9.9')).toBeNull();
    expect(findRelease([], '')).toBeNull();
  });

  test('daysWaiting counts days since the release date', () => {
    const now = new Date('2026-11-15T23:00:00Z');
    expect(daysWaiting('2026-11-12', now)).toBe(3);
    expect(daysWaiting('2026-11-20', now)).toBe(0);
    expect(daysWaiting(undefined, now)).toBeNull();
  });

  test('emails never come through', () => {
    expect(customerFirstName(EMAIL)).toBe('Eko');
    expect(customerFirstName('Eko Prasetyo')).toBe('Eko');
    expect(hideEmails(`mail me at ${EMAIL} please`)).toBe('mail me at [email hidden] please');
  });
});

describe('getWaitingCustomers', () => {
  test('one release: waiting and drafted only, plain rows, no emails', async () => {
    const result = await getWaitingCustomers({ releaseName: '2.4', context: {} }, {});
    expect(result).toEqual({
      ok: true,
      data: [
        { requestKey: 'HELP-5', customer: 'Eko', bugKey: 'LOOP-1', bugSummary: 'PDF export fails', release: '2.4', status: 'waiting', daysWaiting: 3 },
        { requestKey: 'HELP-10', customer: 'Dewi', bugKey: 'LOOP-1', bugSummary: 'PDF export fails', release: '2.4', status: 'drafted', daysWaiting: 3 },
      ],
    });
    noEmails(result);
  });

  test('no release name: all releases, oldest first', async () => {
    const result = await getWaitingCustomers({}, {});
    expect(result.data.map((r) => r.requestKey)).toEqual(['HELP-20', 'HELP-5', 'HELP-10']);
    expect(result.data[0].daysWaiting).toBe(45);
  });

  test('unknown release: not scanned message', async () => {
    const result = await getWaitingCustomers({ releaseName: '9.9' }, {});
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/has not been scanned/);
  });
});

describe('getReleaseMatches', () => {
  test('every status, with score as percent and reasons', async () => {
    const result = await getReleaseMatches({ releaseName: '2.4' }, {});
    expect(result.data.map((r) => [r.requestKey, r.status, r.score])).toEqual([
      ['HELP-3', 'sent', 42],
      ['HELP-5', 'waiting', 42],
      ['HELP-10', 'drafted', 100],
      ['HELP-11', 'not_related', 42],
    ]);
    expect(result.data[2]).toMatchObject({ linked: true, reasons: ['pdf', 'export', 'report'] });
    noEmails(result);
  });

  test('release name is needed', async () => {
    expect((await getReleaseMatches({}, {})).ok).toBe(false);
  });
});

describe('getDraftContext', () => {
  test('returns first name, their words, the bug, the release and the tone', async () => {
    kv.set('match:200:HELP-5', { ...kv.get('match:200:HELP-5'), requestSummary: `PDF broken, write to ${EMAIL}` });
    const result = await getDraftContext({ requestKey: 'help-5' }, {});
    expect(result).toEqual({
      ok: true,
      data: {
        requestKey: 'HELP-5',
        customer: 'Eko',
        bugKey: 'LOOP-1',
        bugSummary: 'PDF export fails',
        release: '2.4',
        status: 'waiting',
        daysWaiting: 3,
        customerWords: 'PDF broken, write to [email hidden]',
        tone: 'formal',
        currentDraft: 'Hi Eko',
      },
    });
    noEmails(result);
  });

  test('a request in two releases: the newest unsent match wins', async () => {
    putMatch('100', '2.3', 'HELP-5', { status: 'waiting' });
    kv.set('match:200:HELP-5', { ...kv.get('match:200:HELP-5'), status: 'sent' });
    expect((await getDraftContext({ requestKey: 'HELP-5' }, {})).data.release).toBe('2.3');
  });

  test('bad or unknown key', async () => {
    expect((await getDraftContext({ requestKey: 'not a key' }, {})).ok).toBe(false);
    expect((await getDraftContext({ requestKey: 'HELP-99' }, {})).message).toMatch(/not matched/);
  });
});

describe('getLoopStatus', () => {
  test('counts for a named release; waiting includes drafted', async () => {
    expect(await getLoopStatus({ releaseName: '2.4' }, {})).toEqual({
      ok: true,
      data: { release: '2.4', waiting: 2, sent: 1, skipped: 0, notRelated: 1 },
    });
  });

  test('no name: newest release; nothing scanned: message', async () => {
    expect((await getLoopStatus({}, {})).data.release).toBe('2.4');
    kv.clear();
    expect(await getLoopStatus({}, {})).toEqual({ ok: false, message: 'No releases have been scanned yet.' });
  });
});
