// UI resolvers. All run as the current user and return { ok: true, data } or { ok: false, message }.
import {
  getSettings as readSettings, saveSettings as writeSettings, checkSettings, listReleases, getRelease, listMatches, countStatuses, getMatch, saveMatch, refreshCounts,
} from '../lib/store.js';
import { getProjects, getProjectVersions, getMyDisplayName, isJiraAdmin, isServiceDeskAgent } from '../lib/jira.js';
import { getRequestStatus, addPublicComment, resolveRequest, checkRequestKey } from '../lib/jsm.js';
import { NOT_CONFIGURED, scanRelease, findMatches } from '../lib/scan.js';
import { reasonWordsFor } from '../lib/match.js';
import { firstWord, fillAgentName, hasReplyText, templateDraft, MAX_DRAFT_CHARS } from '../lib/drafts.js';
import { daysWaiting, customerFirstName, hideEmails } from '../actions/agentActions.js';

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

export const ADMINS_ONLY = 'Only Jira admins can change Loop Closer settings.';
export const ADMINS_ONLY_TEST = 'Only Jira admins can test Loop Closer settings.';

// The Settings page and the inbox share one resolver function, so the admin page alone does not protect
// these resolvers. Ask Jira, as the caller, whether they are a Jira admin. Any failure counts as "no".
async function callerIsAdmin() {
  try {
    return await isJiraAdmin();
  } catch (err) {
    console.error(`admin check failed: ${err.message}`);
    return false;
  }
}

// Matches hold customer names and request text from the service desk, but they live in app storage,
// where Jira's own permissions do not apply. So the inbox resolvers that read or change them first ask
// Jira, as the caller: are they an agent on the chosen service desk, or else a Jira admin?
// A failed check counts as "no"; the caller is refused only when both answers are "no".
export const notAgent = (jsmKey) => `Only agents on the ${jsmKey} service desk can use the Loop Closer inbox.`;
async function agentCheck() {
  const settings = await readSettings();
  if (!settings?.jsmProjectKey) return { ok: false, message: NOT_CONFIGURED };
  try {
    if (await isServiceDeskAgent(settings.jsmProjectKey)) return null;
  } catch (err) {
    console.error(`agent check failed: ${err.message}`);
  }
  if (await callerIsAdmin()) return null; // never throws; a failure is "not admin"
  return { ok: false, message: notAgent(settings.jsmProjectKey) };
}

// Inbox setup banner: only Jira admins get the "Open Settings" button. data: { isAdmin }.
export async function amIAdmin() {
  return { ok: true, data: { isAdmin: await callerIsAdmin() } };
}

// Settings page "Save settings": Jira admins only; checks the fields (design.md Screen 4), then saves them.
export async function saveSettings(payload) {
  try {
    if (!(await callerIsAdmin())) return { ok: false, message: ADMINS_ONLY };
    const checked = checkSettings(payload);
    if (!checked.ok) return checked;
    return { ok: true, data: await writeSettings(checked.data) };
  } catch (err) {
    return fail(err);
  }
}

// Software and service desk projects the current user can see, for the two project Selects.
export async function listProjects() {
  try {
    const [software, service] = await Promise.all([
      getProjects('software', { asUser: true }),
      getProjects('service_desk', { asUser: true }),
    ]);
    return { ok: true, data: { software, service } };
  } catch (err) {
    return fail(err);
  }
}

// Settings page "Test on a release": Jira admins only. Scan steps 1 to 6 with the settings on the form
// (checked, not saved). Saves nothing. data: { count, linked }.
export async function testMatching(payload) {
  try {
    if (!(await callerIsAdmin())) return { ok: false, message: ADMINS_ONLY_TEST };
    const versionId = checkVersionId(payload?.versionId);
    const checked = checkSettings(payload?.settings);
    if (!checked.ok) return checked;
    const res = await findMatches(versionId, { asUser: true, settings: checked.data });
    if (!res.ok) return res;
    const { matches } = res.data;
    return { ok: true, data: { count: matches.length, linked: matches.filter((m) => m.linked).length } };
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
    const denied = await agentCheck();
    if (denied) return denied;
    const releases = await listReleases();
    return { ok: true, data: sortNewestFirst(releases.map(releaseSummary)) };
  } catch (err) {
    return fail(err);
  }
}

// Released, not archived versions of the Jira project that have no release record yet.
// Settings page: { jiraProjectKey, includeScanned: true } lists every released version of the project chosen on the form.
export async function listReleasedVersions(payload = {}) {
  try {
    const projectKey = payload?.jiraProjectKey || (await readSettings())?.jiraProjectKey;
    if (!projectKey) return { ok: false, message: NOT_CONFIGURED };
    const includeScanned = payload?.includeScanned === true;
    const [versions, releases] = await Promise.all([
      getProjectVersions(projectKey, { asUser: true }),
      includeScanned ? [] : listReleases(),
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
    const denied = await agentCheck();
    if (denied) return denied;
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

// One match by { versionId, requestKey }, for the background check after "Improve with Rovo".
// Only what the reply box needs; the draft has the agent name filled like getMatches.
// updatedAt: no writer stores it yet, so it is null for now (the check compares draft and draftSource).
export async function getOneMatch(payload) {
  try {
    const denied = await agentCheck();
    if (denied) return denied;
    const m = await loadMatch(payload);
    const view = matchView(m, await myDisplayName());
    return {
      ok: true,
      data: { requestKey: view.requestKey, status: view.status, draft: view.draft, draftSource: view.draftSource, updatedAt: m.updatedAt ?? null },
    };
  } catch (err) {
    return fail(err);
  }
}

// One release with its matches split by tab. Counts come from the matches, not the stored release counts.
export async function getMatches(payload) {
  try {
    const denied = await agentCheck();
    if (denied) return denied;
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

// Still waiting: not told yet = waiting or drafted (same rule as the release cards and the Rovo agent).
const NOT_TOLD = new Set(['waiting', 'drafted']);

// Stored match + its release -> one Still waiting row. First name only, no email or account id.
export function stillWaitingRow(match, release, now = new Date()) {
  return {
    versionId: String(release.versionId),
    release: release.name,
    requestKey: match.requestKey,
    customer: customerFirstName(match.customerName),
    bugKey: match.bugKey,
    bugSummary: hideEmails(match.bugSummary),
    daysWaiting: daysWaiting(release.releasedAt, now),
  };
}

// Most days waiting first (= oldest release first); unknown days (no release date) last.
// Ties: release name, then request key (HELP-2 before HELP-10).
export function sortStillWaiting(rows) {
  const days = (r) => (typeof r.daysWaiting === 'number' ? r.daysWaiting : -1);
  return [...rows].sort(
    (a, b) => days(b) - days(a)
      || String(a.release).localeCompare(String(b.release))
      || String(a.requestKey).localeCompare(String(b.requestKey), undefined, { numeric: true }),
  );
}

// Every match not told yet, across all releases, with daysWaiting computed now (never stored).
export async function getStillWaiting() {
  try {
    const denied = await agentCheck();
    if (denied) return denied;
    const releases = await listReleases();
    const perRelease = await Promise.all(releases.map((r) => listMatches(r.versionId)));
    const now = new Date();
    const rows = releases.flatMap((release, i) =>
      perRelease[i].filter((m) => NOT_TOLD.has(m.status)).map((m) => stillWaitingRow(m, release, now)));
    return { ok: true, data: sortStillWaiting(rows) };
  } catch (err) {
    return fail(err);
  }
}

export function defineResolvers(resolver) {
  resolver.define('getSettings', getSettings);
  resolver.define('amIAdmin', amIAdmin);
  resolver.define('saveSettings', ({ payload }) => saveSettings(payload));
  resolver.define('listProjects', listProjects);
  resolver.define('testMatching', ({ payload }) => testMatching(payload));
  resolver.define('getReleases', getReleases);
  resolver.define('listReleasedVersions', ({ payload }) => listReleasedVersions(payload));
  resolver.define('getMatches', ({ payload }) => getMatches(payload));
  resolver.define('getMatch', ({ payload }) => getOneMatch(payload));
  resolver.define('updateMatch', ({ payload }) => updateMatch(payload));
  resolver.define('sendReply', ({ payload }) => sendReply(payload));
  resolver.define('rescanRelease', ({ payload }) => rescanRelease(payload));
  resolver.define('getStillWaiting', getStillWaiting);
}
