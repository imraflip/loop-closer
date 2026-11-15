// Background check after "Improve with Rovo": re-reads one match every 3 seconds until Rovo's draft shows up.
// rovo.open() resolves when the chat opens and gives no event when the agent saves, so we poll.
// Plain JS (no React) so the stop rules can be unit tested with fake timers.

export const POLL_EVERY_MS = 3000;
export const POLL_FOR_MS = 60000;

// The saved reply changed: new text or a new label (Template / Rovo / Edited).
export const draftChanged = (before, after) =>
  !!after && (after.draft !== before?.draft || after.draftSource !== before?.draftSource);

// True only when the runtime exposes the page visibility and says it is hidden.
// UI Kit has no DOM access, so `document` may be missing; then this rule never fires and the time limit applies.
export function pageHidden() {
  try {
    return typeof document !== 'undefined' && document.visibilityState === 'hidden';
  } catch {
    return false;
  }
}

// Starts polling. Returns stop(): call it when the user leaves the release or types in that reply box.
// - read(): resolves to { draft, draftSource, ... } for the match (errors are ignored; the next tick retries)
// - baseline: what the match looked like when Rovo was opened
// - onChange(match): called once, when draft or draftSource differs from baseline; polling then stops
// Stops by itself when the page is hidden or after `limit` ms. Never shows a spinner (the caller decides UI).
export function watchDraft({
  read,
  baseline,
  onChange,
  isHidden = pageHidden,
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  every = POLL_EVERY_MS,
  limit = POLL_FOR_MS,
}) {
  const startedAt = now();
  let stopped = false;
  let timer = null;

  const stop = () => {
    stopped = true;
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  const tick = async () => {
    timer = null;
    if (stopped) return;
    if (isHidden() || now() - startedAt >= limit) {
      stop();
      return;
    }
    let current = null;
    try {
      current = await read();
    } catch {
      current = null;
    }
    if (stopped) return; // left or typed while the read was running: never apply it
    if (draftChanged(baseline, current)) {
      stop();
      onChange(current);
      return;
    }
    timer = setTimer(tick, every);
  };

  timer = setTimer(tick, every);
  return stop;
}
