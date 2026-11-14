// UI resolvers. All run as the current user and return { ok: true, data } or { ok: false, message }.
import { getSettings as readSettings, listReleases, getRelease, listMatches, countStatuses } from '../lib/store.js';
import { getProjectVersions } from '../lib/jira.js';
import { NOT_CONFIGURED } from '../lib/scan.js';
import { firstWord } from '../lib/drafts.js';

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

// Tab for each status. "waiting" tab = waiting + drafted; "other" = skipped + not_related.
const TAB_OF = { waiting: 'waiting', drafted: 'waiting', sent: 'sent', skipped: 'other', not_related: 'other' };

// Linked matches first, then the highest score; ties by request key.
export function sortMatches(matches) {
  return [...matches].sort(
    (a, b) => Number(!!b.linked) - Number(!!a.linked) || (Number(b.score) || 0) - (Number(a.score) || 0) || String(a.requestKey).localeCompare(String(b.requestKey)),
  );
}

// Stored match -> what the UI needs. No account id or email leaves the backend.
export function matchView(m) {
  return {
    requestKey: m.requestKey,
    bugKey: m.bugKey,
    bugSummary: m.bugSummary || '',
    linked: !!m.linked,
    score: Number(m.score) || 0,
    reasons: m.reasons || [],
    customerName: String(m.customerName || '').includes('@') ? firstWord(m.customerName) : m.customerName || 'there',
    requestSummary: m.requestSummary || '',
    status: m.status,
    draft: m.draft ?? null,
    draftSource: m.draftSource ?? null,
    sentAt: m.sentAt ?? null,
  };
}

export function groupMatches(matches) {
  const tabs = { waiting: [], sent: [], other: [] };
  for (const m of sortMatches(matches)) {
    const tab = TAB_OF[m.status];
    if (tab) tabs[tab].push(matchView(m));
  }
  return tabs;
}

// One release with its matches split by tab. Counts come from the matches, not the stored release counts.
export async function getMatches(payload) {
  try {
    const versionId = String(payload?.versionId ?? '').trim();
    if (!/^\d+$/.test(versionId)) return { ok: false, message: 'Missing or bad versionId' };
    const [release, matches] = await Promise.all([getRelease(versionId), listMatches(versionId)]);
    if (!release) return { ok: false, message: 'This release has not been scanned yet' };
    return {
      ok: true,
      data: { release: releaseSummary({ ...release, counts: countStatuses(matches) }), tabs: groupMatches(matches) },
    };
  } catch (err) {
    return fail(err);
  }
}

export function defineResolvers(resolver) {
  resolver.define('getSettings', getSettings);
  resolver.define('getReleases', getReleases);
  resolver.define('listReleasedVersions', listReleasedVersions);
  resolver.define('getMatches', ({ payload }) => getMatches(payload));
}
