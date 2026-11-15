import { describe, test, expect, vi, beforeEach } from 'vitest';

const stored = new Map();
vi.mock('@forge/kvs', () => ({
  kvs: { get: async (key) => stored.get(key), set: async (key, value) => stored.set(key, value) },
  WhereConditions: {},
}));

const { getSettings, saveSettings, checkSettings } = await import('../src/lib/store.js');

const good = { jiraProjectKey: 'LOOP', jsmProjectKey: 'HELP' };

describe('getSettings / saveSettings', () => {
  beforeEach(() => stored.clear());

  test('nothing saved: null (no env fallback any more)', async () => {
    vi.stubEnv('LC_JIRA_PROJECT_KEY', 'LOOP');
    vi.stubEnv('LC_JSM_PROJECT_KEY', 'HELP');
    expect(await getSettings()).toBeNull();
    vi.unstubAllEnvs();
  });

  test('saved settings come back', async () => {
    const s = checkSettings(good).data;
    await saveSettings(s);
    expect(await getSettings()).toEqual(s);
  });
});

describe('checkSettings', () => {
  test('both projects only: the defaults fill the rest', () => {
    expect(checkSettings(good)).toEqual({
      ok: true,
      data: { ...good, tone: 'friendly', autoResolve: false, resolveStatusName: 'Resolved', threshold: 0.19, lookbackDays: 180 },
    });
  });

  test('both projects must be chosen', () => {
    expect(checkSettings({ jsmProjectKey: 'HELP' })).toEqual({ ok: false, message: 'Choose the Jira project with the fixes' });
    expect(checkSettings({ jiraProjectKey: 'LOOP', jsmProjectKey: '' })).toEqual({ ok: false, message: 'Choose the service desk project' });
    expect(checkSettings({ jiraProjectKey: 'loop; drop', jsmProjectKey: 'HELP' }).ok).toBe(false);
    expect(checkSettings(null).ok).toBe(false);
  });

  test('match strictness: only Loose 0.12, Normal 0.19, Strict 0.30', () => {
    for (const threshold of [0.12, 0.19, 0.3, '0.3']) expect(checkSettings({ ...good, threshold }).ok).toBe(true);
    for (const threshold of [0.25, 0.35, 0.5, 0, 'abc', null]) {
      expect(checkSettings({ ...good, threshold })).toEqual({ ok: false, message: 'Match strictness must be Loose, Normal or Strict' });
    }
  });

  test('look back: only 90, 180 or 365 days', () => {
    for (const lookbackDays of [90, 180, 365]) expect(checkSettings({ ...good, lookbackDays }).data.lookbackDays).toBe(lookbackDays);
    for (const lookbackDays of [30, 0, 1000, 'x']) {
      expect(checkSettings({ ...good, lookbackDays })).toEqual({ ok: false, message: 'Look back must be 90, 180 or 365 days' });
    }
  });

  test('tone: friendly or formal', () => {
    expect(checkSettings({ ...good, tone: 'formal' }).data.tone).toBe('formal');
    expect(checkSettings({ ...good, tone: 'rude' }).ok).toBe(false);
  });

  test('resolve status: needed only when auto resolve is on; unknown fields dropped', () => {
    expect(checkSettings({ ...good, autoResolve: true, resolveStatusName: '  ' }).ok).toBe(false);
    expect(checkSettings({ ...good, autoResolve: true, resolveStatusName: ' Done ' }).data).toMatchObject({ autoResolve: true, resolveStatusName: 'Done' });
    expect(checkSettings({ ...good, autoResolve: 'yes', resolveStatusName: '' }).data).toMatchObject({ autoResolve: false, resolveStatusName: 'Resolved' });
    expect(checkSettings({ ...good, extra: 'x' }).data).not.toHaveProperty('extra');
  });
});
