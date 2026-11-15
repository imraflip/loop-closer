import { describe, test, expect, vi, beforeEach } from 'vitest';

const kv = new Map();
vi.mock('@forge/kvs', () => ({
  kvs: {
    get: async (key) => kv.get(key),
    set: async (key, value) => kv.set(key, value),
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

// Jira answers by URL: project search pages and project versions.
const jira = { pages: {}, versions: [], admin: true, permissionsFail: false };
const requestJira = vi.fn(async (url) => {
  const u = new URL(String(url), 'https://x');
  if (u.pathname === '/rest/api/3/mypermissions') {
    if (jira.permissionsFail) return { ok: false, status: 500, text: async () => 'down' };
    expect(u.searchParams.get('permissions')).toBe('ADMINISTER');
    return { ok: true, json: async () => ({ permissions: { ADMINISTER: { key: 'ADMINISTER', type: 'GLOBAL', havePermission: jira.admin } } }) };
  }
  if (u.pathname === '/rest/api/3/project/search') {
    const pages = jira.pages[u.searchParams.get('typeKey')] || [[]];
    const i = Number(u.searchParams.get('startAt')) === 0 ? 0 : 1;
    return { ok: true, json: async () => ({ values: pages[i], isLast: i === pages.length - 1 }) };
  }
  return { ok: true, json: async () => jira.versions };
});
vi.mock('@forge/api', () => ({
  default: { asUser: () => ({ requestJira }), asApp: () => ({ requestJira }) },
  route: (s, ...v) => s.reduce((a, p, i) => a + p + (v[i] ?? ''), ''),
}));

const findMatches = vi.fn();
vi.mock('../src/lib/scan.js', async (orig) => ({ ...(await orig()), findMatches: (...args) => findMatches(...args) }));

const { saveSettings, listProjects, testMatching, listReleasedVersions, amIAdmin, ADMINS_ONLY, ADMINS_ONLY_TEST } = await import('../src/resolvers/index.js');

const form = { jiraProjectKey: 'LOOP', jsmProjectKey: 'HELP', tone: 'formal', autoResolve: false, resolveStatusName: 'Resolved', threshold: 0.3, lookbackDays: 90 };

beforeEach(() => {
  kv.clear();
  jira.admin = true; // mocked Jira admin unless a test says otherwise
  jira.permissionsFail = false;
  requestJira.mockClear();
  findMatches.mockReset();
});

describe('saveSettings', () => {
  test('valid: saved and returned', async () => {
    expect(await saveSettings(form)).toEqual({ ok: true, data: form });
    expect(kv.get('settings')).toEqual(form);
  });

  test('invalid: nothing saved, message in plain words', async () => {
    expect(await saveSettings({ ...form, jsmProjectKey: '' })).toEqual({ ok: false, message: 'Choose the service desk project' });
    expect(await saveSettings({ ...form, threshold: 0.35 })).toEqual({ ok: false, message: 'Match strictness must be Loose, Normal or Strict' });
    expect(kv.has('settings')).toBe(false);
  });
});

describe('listProjects', () => {
  test('software and service desk projects, all pages, sorted by name', async () => {
    jira.pages = {
      software: [[{ key: 'LOOP', name: 'Loop', id: '1' }], [{ key: 'APP', name: 'App', id: '2' }]],
      service_desk: [[{ key: 'HELP', name: 'Help desk', id: '3' }]],
    };
    expect(await listProjects()).toEqual({
      ok: true,
      data: { software: [{ key: 'APP', name: 'App' }, { key: 'LOOP', name: 'Loop' }], service: [{ key: 'HELP', name: 'Help desk' }] },
    });
  });

  test('Jira error: ok false', async () => {
    requestJira.mockResolvedValueOnce({ ok: false, status: 403, text: async () => 'no' });
    const res = await listProjects();
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/Get projects failed: 403/);
  });
});

describe('testMatching', () => {
  test('counts matches and linked ones with the form settings; saves nothing', async () => {
    findMatches.mockResolvedValue({ ok: true, data: { release: {}, matches: [{ linked: true }, { linked: false }, { linked: true }] } });
    expect(await testMatching({ versionId: '10001', settings: form })).toEqual({ ok: true, data: { count: 3, linked: 2 } });
    expect(findMatches).toHaveBeenCalledWith('10001', { asUser: true, settings: form });
    expect(kv.size).toBe(0);
  });

  test('bad form or bad version: not run', async () => {
    expect(await testMatching({ versionId: '10001', settings: { ...form, lookbackDays: 30 } })).toEqual({ ok: false, message: 'Look back must be 90, 180 or 365 days' });
    expect((await testMatching({ versionId: 'abc', settings: form })).ok).toBe(false);
    expect(findMatches).not.toHaveBeenCalled();
  });

  test('scan message passes through', async () => {
    findMatches.mockResolvedValue({ ok: false, message: 'No fixed bugs found for this release' });
    expect(await testMatching({ versionId: '10001', settings: form })).toEqual({ ok: false, message: 'No fixed bugs found for this release' });
  });
});

describe('listReleasedVersions for the Settings page', () => {
  test('project from the form, scanned versions included', async () => {
    kv.set('release:10', { versionId: '10', name: '2.4' });
    jira.versions = [
      { id: '10', name: '2.4', released: true, releaseDate: '2026-11-01' },
      { id: '11', name: '2.5', released: false },
    ];
    expect(await listReleasedVersions({ jiraProjectKey: 'LOOP', includeScanned: true })).toEqual({
      ok: true, data: [{ id: '10', name: '2.4', releaseDate: '2026-11-01' }],
    });
    expect(String(requestJira.mock.calls[0][0])).toBe('/rest/api/3/project/LOOP/versions');
  });
});

describe('admin only (mocked non-admin)', () => {
  test('ADMINS_ONLY is the exact message', () => {
    expect(ADMINS_ONLY).toBe('Only Jira admins can change Loop Closer settings.');
  });

  test('saveSettings: non-admin gets the message and nothing is saved', async () => {
    jira.admin = false;
    expect(await saveSettings(form)).toEqual({ ok: false, message: ADMINS_ONLY });
    expect(kv.has('settings')).toBe(false);
  });

  test('saveSettings: admin check comes first, even for a bad form', async () => {
    jira.admin = false;
    expect(await saveSettings({ ...form, threshold: 0.35 })).toEqual({ ok: false, message: ADMINS_ONLY });
  });

  test('saveSettings: permission check failing counts as not admin', async () => {
    jira.permissionsFail = true;
    expect(await saveSettings(form)).toEqual({ ok: false, message: ADMINS_ONLY });
    expect(kv.has('settings')).toBe(false);
  });

  test('testMatching: non-admin gets the message and the scan never runs', async () => {
    jira.admin = false;
    expect(await testMatching({ versionId: '10001', settings: form })).toEqual({ ok: false, message: ADMINS_ONLY_TEST });
    expect(findMatches).not.toHaveBeenCalled();
  });

  test('listProjects stays open: it runs as the user, so Jira shows only their own projects', async () => {
    jira.admin = false;
    jira.pages = { software: [[{ key: 'LOOP', name: 'Loop' }]], service_desk: [[]] };
    expect((await listProjects()).ok).toBe(true);
  });

  test('admin: saveSettings works', async () => {
    expect(await saveSettings(form)).toEqual({ ok: true, data: form });
  });
});

describe('amIAdmin (inbox setup banner)', () => {
  test('admin, non-admin, and a failed check (counts as not admin)', async () => {
    expect(await amIAdmin()).toEqual({ ok: true, data: { isAdmin: true } });
    jira.admin = false;
    expect(await amIAdmin()).toEqual({ ok: true, data: { isAdmin: false } });
    jira.admin = true;
    jira.permissionsFail = true;
    expect(await amIAdmin()).toEqual({ ok: true, data: { isAdmin: false } });
  });
});
