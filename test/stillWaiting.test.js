import { describe, test, expect, vi, beforeEach } from 'vitest';

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
vi.mock('@forge/api', () => ({
  default: { asUser: () => ({ requestJira: vi.fn() }), asApp: () => ({ requestJira: vi.fn() }) },
  route: String.raw,
}));

// Mocked inbox checks: service desk agent, then Jira admin (the real Jira calls are tested in settings.test.js).
const agent = vi.hoisted(() => ({ yes: true, admin: false }));
vi.mock('../src/lib/jira.js', async (orig) => ({
  ...(await orig()),
  isServiceDeskAgent: async () => agent.yes,
  isJiraAdmin: async () => agent.admin,
}));

const { getStillWaiting, sortStillWaiting } = await import('../src/resolvers/index.js');
const { daysWaiting } = await import('../src/actions/agentActions.js');
const { waitedTooLong, daysLabel } = await import('../src/frontend/components/format.js');

describe('days waiting (days since the release date, red after 7)', () => {
  const now = new Date('2026-11-15T10:00:00Z');

  test('released today: 0 days, not red', () => {
    expect(daysWaiting('2026-11-15', now)).toBe(0);
    expect(waitedTooLong(0)).toBe(false);
  });

  test('7 days: not red yet', () => {
    expect(daysWaiting('2026-11-08', now)).toBe(7);
    expect(waitedTooLong(7)).toBe(false);
  });

  test('8 days: red', () => {
    expect(daysWaiting('2026-11-07', now)).toBe(8);
    expect(waitedTooLong(8)).toBe(true);
  });

  test('missing release date: unknown (null), shown as a dash, never red', () => {
    expect(daysWaiting(undefined, now)).toBeNull();
    expect(daysWaiting(null, now)).toBeNull();
    expect(daysWaiting('', now)).toBeNull();
    expect(waitedTooLong(null)).toBe(false);
    expect(daysLabel(null)).toBe('–');
    expect(daysLabel(8)).toBe('8');
  });
});

describe('sortStillWaiting', () => {
  test('most days first, unknown days last, ties by release then request key', () => {
    const rows = [
      { release: '2.4', requestKey: 'HELP-10', daysWaiting: 3 },
      { release: '2.5', requestKey: 'HELP-1', daysWaiting: null },
      { release: '2.4', requestKey: 'HELP-2', daysWaiting: 3 },
      { release: '2.1', requestKey: 'HELP-7', daysWaiting: 40 },
      { release: '2.4', requestKey: 'HELP-3', daysWaiting: 0 },
    ];
    expect(sortStillWaiting(rows).map((r) => r.requestKey)).toEqual(['HELP-7', 'HELP-2', 'HELP-10', 'HELP-3', 'HELP-1']);
  });
});

describe('getStillWaiting', () => {
  const EMAIL = 'eko.prasetyo@example.com';
  const putMatch = (versionId, requestKey, status, extra = {}) =>
    kv.set(`match:${versionId}:${requestKey}`, {
      requestKey, versionId, bugKey: 'LOOP-1', bugSummary: 'PDF export fails', customerName: 'Eko Prasetyo',
      customerAccountId: 'acc-secret', status, ...extra,
    });

  beforeEach(() => {
    kv.clear();
    kv.set('settings', { jiraProjectKey: 'LOOP', jsmProjectKey: 'HELP' });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-15T10:00:00Z'));
    kv.set('release:1', { versionId: '1', name: '2.3', releasedAt: '2026-10-01' });
    kv.set('release:2', { versionId: '2', name: '2.4', releasedAt: '2026-11-12' });
    putMatch('1', 'HELP-20', 'drafted', { customerName: EMAIL });
    putMatch('2', 'HELP-5', 'waiting');
    putMatch('2', 'HELP-6', 'sent');
    putMatch('2', 'HELP-7', 'skipped');
    putMatch('2', 'HELP-8', 'not_related');
    return () => vi.useRealTimers();
  });

  test('waiting and drafted from every release, oldest release first, no emails', async () => {
    const res = await getStillWaiting();
    expect(res).toEqual({
      ok: true,
      data: [
        { versionId: '1', release: '2.3', requestKey: 'HELP-20', customer: 'Eko', bugKey: 'LOOP-1', bugSummary: 'PDF export fails', daysWaiting: 45 },
        { versionId: '2', release: '2.4', requestKey: 'HELP-5', customer: 'Eko', bugKey: 'LOOP-1', bugSummary: 'PDF export fails', daysWaiting: 3 },
      ],
    });
    expect(JSON.stringify(res)).not.toMatch(/@|acc-secret/);
  });

  test('nobody waiting: empty list', async () => {
    kv.clear();
    kv.set('settings', { jiraProjectKey: 'LOOP', jsmProjectKey: 'HELP' });
    expect(await getStillWaiting()).toEqual({ ok: true, data: [] });
  });
});
