import { describe, test, expect, vi, afterEach } from 'vitest';

// Nothing saved in storage: no settings.
vi.mock('@forge/kvs', () => ({
  kvs: { get: async () => undefined, set: vi.fn(), query: vi.fn() },
  WhereConditions: { beginsWith: (p) => p },
}));
const requestJira = vi.fn();
vi.mock('@forge/api', () => ({ default: { asUser: () => ({ requestJira }), asApp: () => ({ requestJira }) }, route: String.raw }));

const { onVersionReleased } = await import('../src/triggers/versionReleased.js');
const { getSettings } = await import('../src/lib/store.js');
const { scanRelease, NOT_CONFIGURED } = await import('../src/lib/scan.js');

describe('no settings saved', () => {
  afterEach(() => vi.restoreAllMocks());

  test('getSettings returns null', async () => {
    expect(await getSettings()).toBeNull();
  });

  test('the scan stops, logs, and calls neither Jira nor storage writes', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await scanRelease('10001')).toEqual({ ok: false, message: NOT_CONFIGURED });
    expect(log).toHaveBeenCalledWith('Loop Closer is not configured');
    expect(requestJira).not.toHaveBeenCalled();
  });

  test('the release trigger does not fail: it logs and returns', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await expect(onVersionReleased({ version: { id: '10001', name: '2.5' } })).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith('Loop Closer is not configured');
    expect(requestJira).not.toHaveBeenCalled();
  });
});
