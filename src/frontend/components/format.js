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


export function cut(text, max) {
  const s = String(text ?? '');
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

export const percent = (score) => `${Math.round((Number(score) || 0) * 100)}%`;

// Up to 3 shared words for an unlinked match (linked matches only carry "linked to KEY").
export const sharedWords = (match) => (match.linked ? [] : (match.reasons || []).slice(0, 3));

export const SOURCE_LABEL = { template: 'Template', rovo: 'Rovo', edited: 'Edited' };
