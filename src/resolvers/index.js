// UI resolvers. All run as the current user and return { ok: true, data } or { ok: false, message }.
import {
  getSettings as readSettings, listReleases, getRelease, listMatches, countStatuses, getMatch, saveMatch, refreshCounts,
} from '../lib/store.js';
import { getProjectVersions, getMyDisplayName } from '../lib/jira.js';
import { getRequestStatus, addPublicComment, resolveRequest, checkRequestKey } from '../lib/jsm.js';
import { NOT_CONFIGURED, scanRelease } from '../lib/scan.js';
import { reasonWordsFor } from '../lib/match.js';
import { firstWord, fillAgentName, hasReplyText, templateDraft, MAX_DRAFT_CHARS } from '../lib/drafts.js';

const fail = (err) => ({ ok: false, message: err?.message || String(err) });

// Signed-in user's display name for the sign-off; '' when it cannot be read (fillAgentName then uses "Support").
async function myDisplayName() {
  try {
    return await getMyDisplayName();
  } catch (err) {
    console.error(`could not read the current user's name: ${err.message}`);
    return '';
  }
}

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

// "Scan a release": runs the full scan as the current user for a version released before install
// (or again for one already scanned; rescans never overwrite sent, skipped, not related or saved drafts).
export async function rescanRelease(payload) {
  try {
    const versionId = checkVersionId(payload?.versionId);
    const res = await scanRelease(versionId, { asUser: true });
    return res.ok ? { ok: true, data: releaseSummary(res.data) } : res;
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
// The draft is shown with the placeholder filled in (agentDisplayName = the signed-in user).
export function matchView(m, agentDisplayName = '') {
  return {
    requestKey: m.requestKey,
    bugKey: m.bugKey,
    bugSummary: m.bugSummary || '',
    linked: !!m.linked,
    score: Number(m.score) || 0,
    reasons: m.reasons || [],
    reasonWords: reasonWordsFor(m),
    customerName: String(m.customerName || '').includes('@') ? firstWord(m.customerName) : m.customerName || 'there',
    requestSummary: m.requestSummary || '',
    status: m.status,
    draft: m.draft == null ? null : fillAgentName(m.draft, agentDisplayName),
    draftSource: m.draftSource ?? null,
    sentAt: m.sentAt ?? null,
  };
}

export function groupMatches(matches, agentDisplayName = '') {
  const tabs = { waiting: [], sent: [], other: [] };
  for (const m of sortMatches(matches)) {
    const tab = TAB_OF[m.status];
    if (tab) tabs[tab].push(matchView(m, agentDisplayName));
  }
  return tabs;
}

const SETTABLE_STATUSES = new Set(['skipped', 'not_related', 'drafted']);
const SENDABLE = new Set(['waiting', 'drafted']);

function checkVersionId(versionId) {
  const id = String(versionId ?? '').trim();
  if (!/^\d+$/.test(id)) throw new Error('Missing or bad versionId');
  return id;
}

// Load one match by { versionId, requestKey }; the backend builds the KVS key itself.
async function loadMatch(payload) {
  const versionId = checkVersionId(payload?.versionId);
  const requestKey = checkRequestKey(String(payload?.requestKey ?? '').trim());
  const match = await getMatch(versionId, requestKey);
  if (!match) throw new Error(`No match for ${requestKey} in this release`);
  return match;
}

// Saves an edited draft and/or a status (skipped, not_related, drafted). Never touches a sent match.
export async function updateMatch(payload) {
  try {
    const match = await loadMatch(payload);
    if (match.status === 'sent') return { ok: false, message: `${match.requestKey} was already sent and cannot be changed` };

    const next = { ...match };
    if (payload.resetDraft) {
      // "Use template": replace the draft with the template for the current tone (Waiting tab only).
      if (!SENDABLE.has(match.status)) return { ok: false, message: `${match.requestKey} is not waiting, so its reply cannot be reset` };
      next.draft = templateDraft(match, await readSettings());
      next.draftSource = 'template';
      next.status = 'drafted';
    } else if (payload.draft !== undefined) {
      const draft = String(payload.draft ?? '').trim().slice(0, MAX_DRAFT_CHARS);
      if (!draft) {
        // Cleared box = "no draft yet": back to waiting, so the next rescan gives it a fresh template draft.
        next.draft = null;
        next.draftSource = null;
        if (next.status === 'drafted') next.status = 'waiting';
      } else {
        if (draft !== match.draft) {
          next.draft = draft;
          next.draftSource = 'edited';
        }
        if (next.status === 'waiting') next.status = 'drafted';
      }
    }
    if (payload.status !== undefined) {
      if (!SETTABLE_STATUSES.has(payload.status)) return { ok: false, message: `Status must be skipped, not_related or drafted` };
      if (payload.status === 'drafted' && !next.draft) return { ok: false, message: 'There is no draft to go back to' };
      next.status = payload.status;
    }

    const saved = await saveMatch(next);
    if (saved.status !== match.status) await refreshCounts(saved.versionId);
    return { ok: true, data: matchView(saved, await myDisplayName()) };
  } catch (err) {
    return fail(err);
  }
}

// Posts the draft as a PUBLIC comment (as the user), marks the match sent only after the 201,
// then resolves the request if settings.autoResolve. Called only from the Send reply button.
export async function sendReply(payload) {
  let match;
  try {
    match = await loadMatch(payload);
  } catch (err) {
    return { ok: false, message: `Not sent: ${err.message}` };
  }
  const notSent = (reason) => ({ ok: false, message: `Not sent: ${reason}` });
  if (match.status === 'sent') return notSent(`${match.requestKey} was already sent`);
  if (!SENDABLE.has(match.status)) return notSent(`${match.requestKey} is marked ${match.status.replace('_', ' ')}`);
  if (!hasReplyText(match.draft)) return notSent('the reply is empty');

  let body;
  try {
    const { statusCategory, status, requestTypeId } = await getRequestStatus(match.requestKey);
    if (statusCategory === 'DONE') return notSent(`${match.requestKey} is already closed (${status || 'Done'})`);
    if (!requestTypeId) {
      return notSent(`${match.requestKey}: this request has no request type; create it via the portal (Raise a request)`);
    }
    body = fillAgentName(match.draft, await myDisplayName());
    if (!body.trim()) return notSent('the reply is empty');
    await addPublicComment(match.requestKey, body);
  } catch (err) {
    console.error(`send failed for ${match.requestKey}: ${err.message}`);
    return notSent(err.message);
  }

  // The comment exists now (201). From here on, never report "not sent".
  let saved;
  try {
    saved = await saveMatch({ ...match, status: 'sent', draft: body, sentAt: new Date().toISOString() });
    await refreshCounts(saved.versionId);
  } catch (err) {
    console.error(`reply posted on ${match.requestKey} but saving failed: ${err.message}`);
    return { ok: false, message: `Reply was posted on ${match.requestKey}, but Loop Closer could not save it as sent: ${err.message}. Do not send again.` };
  }

  let warning = null;
  try {
    const settings = await readSettings();
    if (settings?.autoResolve) await resolveRequest(match.requestKey, settings.resolveStatusName || 'Resolved');
  } catch (err) {
    console.error(`resolve failed for ${match.requestKey}: ${err.message}`);
    warning = `Reply sent, but ${match.requestKey} was not resolved: ${err.message}`;
  }
  return { ok: true, data: { match: matchView(saved), warning } };
}

// One release with its matches split by tab. Counts come from the matches, not the stored release counts.
export async function getMatches(payload) {
  try {
    const versionId = checkVersionId(payload?.versionId);
    const [release, matches, agentName] = await Promise.all([getRelease(versionId), listMatches(versionId), myDisplayName()]);
    if (!release) return { ok: false, message: 'This release has not been scanned yet' };
    return {
      ok: true,
      data: { release: releaseSummary({ ...release, counts: countStatuses(matches) }), tabs: groupMatches(matches, agentName) },
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
  resolver.define('updateMatch', ({ payload }) => updateMatch(payload));
  resolver.define('sendReply', ({ payload }) => sendReply(payload));
  resolver.define('rescanRelease', ({ payload }) => rescanRelease(payload));
}
