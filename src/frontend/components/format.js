// Small text helpers shared by the inbox components.
const DAY_MS = 24 * 60 * 60 * 1000;

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// "today", "1 day ago", "3 days ago" from a yyyy-mm-dd release date.
export function daysAgo(date) {
  const then = Date.parse(date);
  if (Number.isNaN(then)) return null;
  const days = Math.max(0, Math.floor((Date.now() - then) / DAY_MS));
  return days === 0 ? 'today' : `${plural(days, 'day', 'days')} ago`;
}

// Still waiting: days show red after 7 days (8 or more). Unknown days (null) are never red.
export const RED_AFTER_DAYS = 7;
export const waitedTooLong = (days) => typeof days === 'number' && days > RED_AFTER_DAYS;

// "12" or "–" when the release date is unknown.
export const daysLabel = (days) => (typeof days === 'number' ? String(days) : '–');

// The request opened from Still waiting goes to the top of the list (UI Kit cannot scroll to a row).
// Others keep their order; an unknown or empty key leaves the list as it is.
export function pinFirst(list, requestKey) {
  const i = requestKey ? list.findIndex((m) => m.requestKey === requestKey) : -1;
  return i <= 0 ? list : [list[i], ...list.slice(0, i), ...list.slice(i + 1)];
}

// Inbox banner when no settings are saved. Admins can open Settings; everyone else is told to ask one.
export const SETTINGS_MODULE_KEY = 'loop-closer-settings'; // manifest jira:adminPage key
export const setupBanner = (isAdmin) =>
  isAdmin
    ? { text: 'Loop Closer needs setup. Open Settings to choose your projects.', showButton: true }
    : { text: 'Loop Closer is not set up yet. Ask a Jira admin to choose projects in Loop Closer settings.', showButton: false };

// Settings page "Test on a release" result: "This release would match 10 customers (4 linked)."
export const testResultText = ({ count, linked }) =>
  `This release would match ${plural(count, 'customer', 'customers')} (${linked} linked).`;

export function cut(text, max) {
  const s = String(text ?? '');
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

export const percent = (score) => `${Math.round((Number(score) || 0) * 100)}%`;

// Up to 3 shared words for an unlinked match (linked matches only carry "linked to KEY").
// Reasons are word stems ("logg"); reasonWords maps each to a full word ("logging").
// The backend rebuilds reasonWords for old matches; a stem shows only when no full word was found.
export const sharedWords = (match) =>
  match.linked ? [] : (match.reasons || []).slice(0, 3).map((s) => match.reasonWords?.[s] || s);

const pad2 = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// "Sent today" or "Sent 2026-11-14", in the viewer's time zone (sentAt is stored as UTC ISO). null if unknown.
export function sentLabel(sentAt, now = new Date()) {
  const sent = new Date(sentAt ?? '');
  if (!sentAt || Number.isNaN(sent.getTime())) return null;
  return localDate(sent) === localDate(now) ? 'Sent today' : `Sent ${localDate(sent)}`;
}

// Text from a UI Kit onChange argument: an event ({ target: { value } }) or, for some components, the value itself.
// Returns null when there is no text, so callers never store undefined.
export function changeText(arg) {
  if (typeof arg === 'string') return arg;
  const value = arg?.target?.value;
  return typeof value === 'string' ? value : null;
}

// Key for the reply TextArea: a new key (fresh mount) only when another match opens or the saved draft changes,
// never on a keystroke. The TextArea is uncontrolled (defaultValue), so typing is never overwritten.
export const draftBoxKey = (match) => `${match.requestKey}|${match.status}|${match.draft || ''}`;

// Send and next is allowed only with real text (not empty, not only spaces or line breaks) and when idle.
export const canSend = (draft, busy) => !busy && typeof draft === 'string' && draft.trim().length > 0;

// Read-only reply text -> paragraphs of lines, so line breaks show without a TextArea.
// Blank lines separate paragraphs; single line breaks stay inside a paragraph.
export function draftParagraphs(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n+/)
    .map((p) => p.split('\n').map((line) => line.trimEnd()))
    .map((lines) => lines.filter((line, i) => line || (i > 0 && i < lines.length - 1)))
    .filter((lines) => lines.some(Boolean));
}

export const SOURCE_LABEL = { template: 'Template', rovo: 'Rovo', edited: 'Edited' };

// "Improve with Rovo": only for replies not sent yet (waiting or drafted); hidden for sent, skipped, not related.
export const canImproveWithRovo = (match) => match?.status === 'waiting' || match?.status === 'drafted';

export const improvePrompt = (requestKey) => `Improve the reply for ${requestKey}`;

// Payload for rovo.open() from @forge/bridge: our own agent (manifest rovo:agent key and name).
export const rovoOpenPayload = (match) => ({
  type: 'forge',
  agentName: 'Loop Closer',
  agentKey: 'loop-closer-agent',
  prompt: improvePrompt(match.requestKey),
});
