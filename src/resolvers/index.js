// UI resolvers. All run as the current user and return { ok: true, data } or { ok: false, message }.
import { getSettings as readSettings, listReleases } from '../lib/store.js';
import { getProjectVersions } from '../lib/jira.js';
import { NOT_CONFIGURED } from '../lib/scan.js';

const fail = (err) => ({ ok: false, message: err?.message || String(err) });

export async function getSettings() {
  try {
    return { ok: true, data: (await readSettings()) ?? null };
  } catch (err) {
    return fail(err);
  }
}

// Release record -> summary row. "waiting" = waiting + drafted; total = every match in the release.
export function releaseSummary(release) {
  const c = release.counts || {};
  const n = (k) => Number(c[k]) || 0;
  return {
    versionId: release.versionId,
    name: release.name,
    releasedAt: release.releasedAt || null,
    bugCount: (release.bugKeys || []).length,
    waiting: n('waiting') + n('drafted'),
    sent: n('sent'),
    total: n('waiting') + n('drafted') + n('sent') + n('skipped') + n('notRelated'),
  };
}

// Newest release first (ISO dates sort as text); undated releases last.
export function sortNewestFirst(rows, dateField = 'releasedAt') {
  return [...rows].sort((a, b) => String(b[dateField] || '').localeCompare(String(a[dateField] || '')));
}

export async function getReleases() {
  try {
    const releases = await listReleases();
    return { ok: true, data: sortNewestFirst(releases.map(releaseSummary)) };
  } catch (err) {
    return fail(err);
  }
}

// Released, not archived versions of the Jira project that have no release record yet.
export async function listReleasedVersions() {
  try {
    const settings = await readSettings();
    if (!settings?.jiraProjectKey) return { ok: false, message: NOT_CONFIGURED };
    const [versions, releases] = await Promise.all([
      getProjectVersions(settings.jiraProjectKey, { asUser: true }),
      listReleases(),
    ]);
    const scanned = new Set(releases.map((r) => String(r.versionId)));
    const data = versions
      .filter((v) => v.released && !v.archived && !scanned.has(String(v.id)))
      .map((v) => ({ id: String(v.id), name: v.name, releaseDate: v.releaseDate || null }));
    return { ok: true, data: sortNewestFirst(data, 'releaseDate') };
  } catch (err) {
    return fail(err);
  }
}

export function defineResolvers(resolver) {
  resolver.define('getSettings', getSettings);
  resolver.define('getReleases', getReleases);
  resolver.define('listReleasedVersions', listReleasedVersions);
}
