// TEMP Phase 1: tests for the env fallback in getSettings(). Remove with the fallback in Phase 4.
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

const stored = new Map();
vi.mock('@forge/kvs', () => ({
  kvs: { get: async (key) => stored.get(key) },
  WhereConditions: {},
}));

const { getSettings, SETTINGS_DEFAULTS } = await import('../src/lib/store.js');

describe('getSettings env fallback (TEMP Phase 1)', () => {
  beforeEach(() => {
    stored.clear();
    vi.stubEnv('LC_JIRA_PROJECT_KEY', 'LOOP');
    vi.stubEnv('LC_JSM_PROJECT_KEY', 'HELP');
  });
  afterEach(() => vi.unstubAllEnvs());

  test('nothing stored: uses the env keys and the defaults', async () => {
    expect(await getSettings()).toEqual({ jiraProjectKey: 'LOOP', jsmProjectKey: 'HELP', ...SETTINGS_DEFAULTS });
  });

  test('stored settings win over env', async () => {
    stored.set('settings', { jiraProjectKey: 'ABC', jsmProjectKey: 'SD', threshold: 0.3 });
    expect(await getSettings()).toEqual({ jiraProjectKey: 'ABC', jsmProjectKey: 'SD', threshold: 0.3 });
  });

  test('nothing stored and an env key missing: null', async () => {
    vi.stubEnv('LC_JSM_PROJECT_KEY', '');
    expect(await getSettings()).toBeNull();
  });
});
