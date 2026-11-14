// Rovo actions (also used as MCP tools later). Each handler gets (payload, context);
// inputs are on the payload by input name. KVS only: no Jira calls, no outside calls.
// Every handler returns { ok: true, data } or { ok: false, message }.
// Never return customer emails or account ids.
import { listReleases, listMatches, getMatch, saveMatch, refreshCounts, getSettings, countStatuses } from '../lib/store.js';
import { firstWord, wordCount, MAX_WORDS, MAX_DRAFT_CHARS } from '../lib/drafts.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const WAITING_STATUSES = new Set(['waiting', 'drafted']); // not told yet
const REQUEST_KEY_RE = /^[A-Z][A-Z0-9_]*-\d+$/;
const EMAIL_RE = /[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[a-z]{2,}/gi;

const notScanned = (name) =>
  `Release "${name}" has not been scanned. Open the Release Inbox and click "Scan this release".`;

// --- pure helpers (exported for tests) ---

export function inputText(payload, name) {
  const value = payload?.[name];
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

// Free text from the customer or Jira may hold an email address: hide it.
export function hideEmails(text) {
  return String(text ?? '').replace(EMAIL_RE, '[email hidden]');
}

// Customer first name only; firstWord() already turns "ana.lima@x.com" into "Ana".
export function customerFirstName(customerName) {
  return hideEmails(firstWord(customerName));
}

// Days since the release date ("YYYY-MM-DD" or ISO), never below 0; null if unknown.
export function daysWaiting(releasedAt, now = new Date()) {
  const released = Date.parse(String(releasedAt ?? '').slice(0, 10));
  if (Number.isNaN(released)) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.floor((today - released) / DAY_MS));
}

const byReleasedAt = (a, b) =>
  String(a.releasedAt ?? '').localeCompare(String(b.releasedAt ?? '')) || String(a.name).localeCompare(String(b.name));

// Name match ignoring case; empty name = newest releasedAt. null when not found.
export function findRelease(releases, releaseName) {
  const list = releases ?? [];
  const name = String(releaseName ?? '').trim().toLowerCase();
  if (!name) return [...list].sort(byReleasedAt).at(-1) ?? null;
  return list.find((r) => String(r.name ?? '').trim().toLowerCase() === name) ?? null;
}

// One stored match -> the plain row the agent sees.
export function matchRow(match, release, now = new Date()) {
  return {
    requestKey: match.requestKey,
    customer: customerFirstName(match.customerName),
    bugKey: match.bugKey,
    bugSummary: hideEmails(match.bugSummary),
    release: release.name,
    status: match.status,
    daysWaiting: daysWaiting(release.releasedAt, now),
  };
}

const byRequestKey = (a, b) => String(a.requestKey).localeCompare(String(b.requestKey), undefined, { numeric: true });

// --- action handlers ---

async function safely(name, run) {
  try {
    return await run();
  } catch (error) {
    console.error(`${name} failed`, error);
    return { ok: false, message: `Could not read Loop Closer data: ${error?.message || 'unknown error'}` };
  }
}

// get-waiting-customers: unsent matches (waiting or drafted), one release or all, oldest release first.
export function getWaitingCustomers(payload) {
  return safely('getWaitingCustomers', async () => {
    const releaseName = inputText(payload, 'releaseName');
    const releases = await listReleases();
    let chosen;
    if (releaseName) {
      const release = findRelease(releases, releaseName);
      if (!release) return { ok: false, message: notScanned(releaseName) };
      chosen = [release];
    } else {
      chosen = [...releases].sort(byReleasedAt);
    }

    const now = new Date();
    const rows = [];
    for (const release of chosen) {
      const matches = (await listMatches(release.versionId)).filter((m) => WAITING_STATUSES.has(m.status));
      rows.push(...matches.sort(byRequestKey).map((m) => matchRow(m, release, now)));
    }
    return { ok: true, data: rows };
  });
}

// get-release-matches: every match of one release, with score and reasons.
export function getReleaseMatches(payload) {
  return safely('getReleaseMatches', async () => {
    const releaseName = inputText(payload, 'releaseName');
    if (!releaseName) return { ok: false, message: 'Please give a release name, for example 2.4.' };
    const release = findRelease(await listReleases(), releaseName);
    if (!release) return { ok: false, message: notScanned(releaseName) };

    const now = new Date();
    const rows = (await listMatches(release.versionId)).sort(byRequestKey).map((m) => ({
      ...matchRow(m, release, now),
      linked: !!m.linked,
      score: Math.round((Number(m.score) || 0) * 100), // percent
      reasons: (m.reasons ?? []).map(hideEmails),
    }));
    return { ok: true, data: rows };
  });
}

// A request can match more than one release: the newest waiting/drafted match wins,
// else the newest match of any status. null when the request is in no scanned release.
async function findMatchForRequest(requestKey) {
  const releases = [...(await listReleases())].sort(byReleasedAt).reverse();
  let found = null;
  for (const release of releases) {
    const match = await getMatch(release.versionId, requestKey);
    if (!match) continue;
    if (WAITING_STATUSES.has(match.status)) return { match, release };
    found ??= { match, release };
  }
  return found;
}

const notMatched = (requestKey) =>
  `${requestKey} is not matched to any scanned release. Scan the release in the Release Inbox first.`;

// Why a sent, skipped or not related match cannot get a new draft; null when it can.
// Told to the agent before it writes anything (saveReplyDraft checks again).
export function closedMessage(match) {
  const key = match.requestKey;
  const raw = String(match.customerName ?? '').trim();
  const name = raw && raw !== 'there' ? customerFirstName(raw) : 'the customer';
  if (match.status === 'sent') return `${key} was already sent to ${name}, so the reply cannot be improved.`;
  if (match.status === 'skipped') return `${key} was skipped, so there is no draft to improve.`;
  if (match.status === 'not_related') return `${key} was marked not related, so there is no draft to improve.`;
  return null;
}

// get-draft-context: what the agent needs to write one reply. Refuses sent, skipped and not related matches.
export function getDraftContext(payload) {
  return safely('getDraftContext', async () => {
    const requestKey = inputText(payload, 'requestKey').toUpperCase();
    if (!REQUEST_KEY_RE.test(requestKey)) {
      return { ok: false, message: 'Please give a service desk request key, for example HELP-5.' };
    }

    const found = await findMatchForRequest(requestKey);
    if (!found) {
      return { ok: false, message: notMatched(requestKey) };
    }

    const { match, release } = found;
    const closed = closedMessage(match);
    if (closed) return { ok: false, message: closed };
    const settings = await getSettings();
    return {
      ok: true,
      data: {
        ...matchRow(match, release),
        customerWords: hideEmails(match.requestSummary),
        tone: settings?.tone === 'formal' ? 'formal' : 'friendly',
        currentDraft: match.draft ? hideEmails(match.draft) : null,
      },
    };
  });
}

// get-loop-status: counts for one release (newest when no name). waiting includes drafted.
export function getLoopStatus(payload) {
  return safely('getLoopStatus', async () => {
    const releaseName = inputText(payload, 'releaseName');
    const releases = await listReleases();
    const release = findRelease(releases, releaseName);
    if (!release) {
      return { ok: false, message: releaseName ? notScanned(releaseName) : 'No releases have been scanned yet.' };
    }

    const counts = countStatuses(await listMatches(release.versionId));
    return {
      ok: true,
      data: {
        release: release.name,
        waiting: counts.waiting + counts.drafted,
        sent: counts.sent,
        skipped: counts.skipped,
        notRelated: counts.notRelated,
      },
    };
  });
}

// save-reply-draft: saves the agent's draft for a person to review. Never sends anything:
// only sendReply (a user click in the inbox) posts to the customer.
export function saveReplyDraft(payload) {
  return safely('saveReplyDraft', async () => {
    const requestKey = inputText(payload, 'requestKey').toUpperCase();
    if (!REQUEST_KEY_RE.test(requestKey)) {
      return { ok: false, message: 'Please give a service desk request key, for example HELP-5.' };
    }

    const check = checkRovoDraft(inputText(payload, 'draftText'));
    if (!check.ok) return check;

    const found = await findMatchForRequest(requestKey);
    if (!found) return { ok: false, message: notMatched(requestKey) };

    const { match } = found;
    if (!WAITING_STATUSES.has(match.status)) {
      return { ok: false, message: `${requestKey} is ${STATUS_WORDS[match.status] ?? match.status}, so the draft was not saved.` };
    }

    await saveMatch({ ...match, draft: check.data, draftSource: 'rovo', status: 'drafted' });
    if (match.status !== 'drafted') await refreshCounts(match.versionId);
    return {
      ok: true,
      data: { requestKey, saved: true, message: 'Draft saved. Review and send it in the Release Inbox.' },
    };
  });
}

const STATUS_WORDS = { sent: 'already sent', skipped: 'skipped', not_related: 'marked not related' };

// Draft text rules for the agent: not empty, at most MAX_WORDS words, cut to MAX_DRAFT_CHARS.
export function checkRovoDraft(text) {
  const draft = String(text ?? '').trim();
  if (!draft) return { ok: false, message: 'The draft is empty.' };
  const words = wordCount(draft);
  if (words > MAX_WORDS) {
    return { ok: false, message: `The draft has ${words} words. Keep it under ${MAX_WORDS} words and try again.` };
  }
  return { ok: true, data: draft.slice(0, MAX_DRAFT_CHARS) };
}
