// KVS keys and read/write helpers for settings, releases and matches.
import { kvs, WhereConditions } from '@forge/kvs';

// Forge KVS key rule (limits-kvs-ce): max 500 chars, this character set.
const KEY_RE = /^(?!\s+$)[a-zA-Z0-9:._\s\-#]+$/;
const PAGE_SIZE = 100; // kvs.query max per page

function checkKey(key) {
  if (key.length > 500 || !KEY_RE.test(key)) throw new Error(`Bad storage key: ${key}`);
  return key;
}

export const SETTINGS_KEY = 'settings';
export const RELEASE_PREFIX = 'release:';
export const releaseKey = (versionId) => checkKey(`release:${versionId}`);
export const matchPrefix = (versionId) => checkKey(`match:${versionId}:`);
export const matchKey = (versionId, requestKey) => checkKey(`match:${versionId}:${requestKey}`);

export const STATUSES = ['waiting', 'drafted', 'sent', 'skipped', 'not_related'];

// Every value whose key starts with prefix, following nextCursor.
async function queryAll(prefix) {
  const values = [];
  let cursor;
  do {
    let query = kvs.query().where('key', WhereConditions.beginsWith(prefix)).limit(PAGE_SIZE);
    if (cursor) query = query.cursor(cursor);
    const page = await query.getMany();
    values.push(...page.results.map((r) => r.value));
    cursor = page.nextCursor;
  } while (cursor);
  return values;
}

export const SETTINGS_DEFAULTS = {
  tone: 'friendly',
  autoResolve: false,
  resolveStatusName: 'Resolved',
  threshold: 0.19,
  lookbackDays: 180,
};

export async function getSettings() {
  const stored = await kvs.get(SETTINGS_KEY);
  if (stored) return stored;

  // TEMP Phase 1: no Settings page yet, so fall back to Forge environment variables
  // (forge variables set LC_JIRA_PROJECT_KEY / LC_JSM_PROJECT_KEY). Remove in Phase 4.
  const jiraProjectKey = process.env.LC_JIRA_PROJECT_KEY;
  const jsmProjectKey = process.env.LC_JSM_PROJECT_KEY;
  if (jiraProjectKey && jsmProjectKey) return { jiraProjectKey, jsmProjectKey, ...SETTINGS_DEFAULTS };

  return null;
}

export async function getRelease(versionId) {
  return (await kvs.get(releaseKey(versionId))) ?? null;
}

export async function saveRelease(release) {
  await kvs.set(releaseKey(release.versionId), release);
  return release;
}

export function listReleases() {
  return queryAll(RELEASE_PREFIX);
}

export async function getMatch(versionId, requestKey) {
  return (await kvs.get(matchKey(versionId, requestKey))) ?? null;
}

export async function saveMatch(match) {
  await kvs.set(matchKey(match.versionId, match.requestKey), match);
  return match;
}

export function listMatches(versionId) {
  return queryAll(matchPrefix(versionId));
}

// counts: { waiting, drafted, sent, skipped, notRelated }
export function countStatuses(matches) {
  const counts = { waiting: 0, drafted: 0, sent: 0, skipped: 0, notRelated: 0 };
  for (const m of matches) {
    const field = m.status === 'not_related' ? 'notRelated' : m.status;
    if (field in counts) counts[field] += 1;
  }
  return counts;
}

// Recalculate a release's counts from its stored matches (call after every status change).
export async function refreshCounts(versionId) {
  const release = await getRelease(versionId);
  if (!release) return null;
  release.counts = countStatuses(await listMatches(versionId));
  return saveRelease(release);
}
