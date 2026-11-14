import { describe, test, expect, vi, beforeEach } from 'vitest';

const kv = new Map();
const versions = { list: [] };
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
vi.mock('@forge/api', () => {
  const requestJira = vi.fn(async () => ({ ok: true, json: async () => versions.list }));
  return { default: { asUser: () => ({ requestJira }), asApp: () => ({ requestJira }) }, route: (s, ...v) => s.reduce((a, p, i) => a + p + (v[i] ?? ''), '') };
});

const { getReleases, listReleasedVersions, getSettings, releaseSummary } = await import('../src/resolvers/index.js');

const release = (versionId, releasedAt, counts) => ({
  versionId, name: `v${versionId}`, releasedAt, jiraProjectKey: 'LOOP', bugKeys: ['LOOP-1', 'LOOP-2'], counts,
});

describe('getReleases', () => {
  beforeEach(() => kv.clear());

  test('newest first; waiting = waiting + drafted; total = all matches', async () => {
    kv.set('release:1', release('1', '2026-10-01', { waiting: 1, drafted: 7, sent: 2, skipped: 1, notRelated: 1 }));
    kv.set('release:2', release('2', '2026-11-10', { waiting: 0, drafted: 0, sent: 3, skipped: 0, notRelated: 0 }));
    kv.set('match:1:HELP-5', { status: 'waiting' }); // not a release record
    const res = await getReleases();
    expect(res.ok).toBe(true);
    expect(res.data.map((r) => r.versionId)).toEqual(['2', '1']);
    expect(res.data[1]).toEqual({ versionId: '1', name: 'v1', releasedAt: '2026-10-01', bugCount: 2, waiting: 8, sent: 2, total: 12 });
  });

  test('no releases: empty list', async () => {
    expect(await getReleases()).toEqual({ ok: true, data: [] });
  });

  test('missing counts do not crash', () => {
    expect(releaseSummary({ versionId: '3', name: 'x' })).toMatchObject({ bugCount: 0, waiting: 0, sent: 0, total: 0 });
  });
});

describe('listReleasedVersions', () => {
  beforeEach(() => {
    kv.clear();
    vi.stubEnv('LC_JIRA_PROJECT_KEY', '');
    vi.stubEnv('LC_JSM_PROJECT_KEY', '');
  });

  test('not configured', async () => {
    expect(await listReleasedVersions()).toEqual({ ok: false, message: 'Loop Closer is not configured' });
    expect(await getSettings()).toEqual({ ok: true, data: null });
  });

  test('released, not archived, not scanned yet, newest first', async () => {
    kv.set('settings', { jiraProjectKey: 'LOOP', jsmProjectKey: 'HELP' });
    kv.set('release:10', release('10', '2026-11-01', {}));
    versions.list = [
      { id: '10', name: '2.4', released: true, releaseDate: '2026-11-01' },
      { id: '11', name: '2.5', released: true, releaseDate: '2026-11-12' },
      { id: '12', name: '2.3', released: true, releaseDate: '2026-09-01' },
      { id: '13', name: '2.6', released: false },
      { id: '14', name: '1.0', released: true, archived: true, releaseDate: '2025-01-01' },
    ];
    expect(await listReleasedVersions()).toEqual({
      ok: true,
      data: [
        { id: '11', name: '2.5', releaseDate: '2026-11-12' },
        { id: '12', name: '2.3', releaseDate: '2026-09-01' },
      ],
    });
  });
});
