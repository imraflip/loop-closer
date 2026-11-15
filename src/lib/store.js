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

// Settings page choices (design.md Screen 4). Match strictness: Loose 0.12, Normal 0.19, Strict 0.30.
export const THRESHOLDS = [0.12, 0.19, 0.3];
export const LOOKBACK_CHOICES = [90, 180, 365];
export const TONES = ['friendly', 'formal'];
const PROJECT_KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const MAX_STATUS_NAME = 100;

// Settings from the Settings page -> a clean settings object, or the first problem in plain words.
// Only the known fields are kept; missing optional fields get the defaults.
export function checkSettings(input) {
  const s = input && typeof input === 'object' ? input : {};
  const bad = (message) => ({ ok: false, message });
  const jiraProjectKey = String(s.jiraProjectKey ?? '').trim();
  const jsmProjectKey = String(s.jsmProjectKey ?? '').trim();
  if (!PROJECT_KEY_RE.test(jiraProjectKey)) return bad('Choose the Jira project with the fixes');
  if (!PROJECT_KEY_RE.test(jsmProjectKey)) return bad('Choose the service desk project');

  const tone = s.tone ?? SETTINGS_DEFAULTS.tone;
  if (!TONES.includes(tone)) return bad('Reply tone must be Friendly or Formal');
  const threshold = s.threshold === undefined ? SETTINGS_DEFAULTS.threshold : Number(s.threshold);
  if (!THRESHOLDS.includes(threshold)) return bad('Match strictness must be Loose, Normal or Strict');
  const lookbackDays = s.lookbackDays === undefined ? SETTINGS_DEFAULTS.lookbackDays : Number(s.lookbackDays);
  if (!LOOKBACK_CHOICES.includes(lookbackDays)) return bad('Look back must be 90, 180 or 365 days');

  const autoResolve = s.autoResolve === true;
  const statusName = String(s.resolveStatusName ?? '').trim();
  if (statusName.length > MAX_STATUS_NAME) return bad(`Resolve status name must be under ${MAX_STATUS_NAME} characters`);
  if (autoResolve && !statusName) return bad('Enter a resolve status name, or turn off Resolve request after sending');
  const resolveStatusName = statusName || SETTINGS_DEFAULTS.resolveStatusName;

  return { ok: true, data: { jiraProjectKey, jsmProjectKey, tone, autoResolve, resolveStatusName, threshold, lookbackDays } };
}

// Saved settings, or null until an admin saves the Settings page.
export async function getSettings() {
  return (await kvs.get(SETTINGS_KEY)) ?? null;
}

// Saves settings already checked with checkSettings().
export async function saveSettings(settings) {
  await kvs.set(SETTINGS_KEY, settings);
  return settings;
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
