import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { watchDraft, draftChanged, pageHidden, POLL_EVERY_MS, POLL_FOR_MS } from '../src/frontend/components/draftWatch.js';

const BASE = { draft: 'Hi Eko,\n\nFixed.\n\nThanks,\nRafli', draftSource: 'template' };
const ROVO = { draft: 'Hi Eko, good news: PDF export works again in 2.4.\n\nRafli', draftSource: 'rovo' };

// Runs every due timer and lets the awaited read() settle.
const advance = async (ms) => {
  await vi.advanceTimersByTimeAsync(ms);
};

function setup({ reads = () => BASE, hidden = () => false } = {}) {
  const read = vi.fn(async () => reads());
  const onChange = vi.fn();
  const stop = watchDraft({ read, baseline: BASE, onChange, isHidden: hidden });
  return { read, onChange, stop };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('draftChanged', () => {
  test('new text or a new label counts; same text and label does not', () => {
    expect(draftChanged(BASE, { ...BASE })).toBe(false);
    expect(draftChanged(BASE, { ...BASE, draft: 'other' })).toBe(true);
    expect(draftChanged(BASE, { ...BASE, draftSource: 'rovo' })).toBe(true);
    expect(draftChanged(BASE, null)).toBe(false); // failed read
  });
});

describe('watchDraft stop rules', () => {
  test('reads every 3 seconds, no read before the first 3 seconds', async () => {
    const { read } = setup();
    await advance(POLL_EVERY_MS - 1);
    expect(read).not.toHaveBeenCalled();
    await advance(1);
    expect(read).toHaveBeenCalledTimes(1);
    await advance(POLL_EVERY_MS * 2);
    expect(read).toHaveBeenCalledTimes(3);
  });

  test('stops as soon as the draft changes: onChange once, no more reads', async () => {
    let n = 0;
    const { read, onChange } = setup({ reads: () => (++n >= 2 ? ROVO : BASE) });
    await advance(POLL_EVERY_MS * 2);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(ROVO);
    await advance(POLL_EVERY_MS * 5);
    expect(read).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  test('stops after 60 seconds with no change', async () => {
    const { read, onChange } = setup();
    await advance(POLL_FOR_MS + POLL_EVERY_MS * 5);
    expect(read).toHaveBeenCalledTimes(POLL_FOR_MS / POLL_EVERY_MS - 1); // reads at 3 s ... 57 s
    expect(onChange).not.toHaveBeenCalled();
  });

  test('stops when the page is hidden', async () => {
    let hidden = false;
    const { read } = setup({ hidden: () => hidden });
    await advance(POLL_EVERY_MS);
    expect(read).toHaveBeenCalledTimes(1);
    hidden = true;
    await advance(POLL_EVERY_MS * 3);
    hidden = false; // coming back does not restart it
    await advance(POLL_EVERY_MS * 3);
    expect(read).toHaveBeenCalledTimes(1);
  });

  test('leaving the release (stop) ends it: no reads, no onChange', async () => {
    const { read, onChange, stop } = setup({ reads: () => ROVO });
    stop();
    await advance(POLL_FOR_MS);
    expect(read).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  test('typing during a read: the late result is never applied', async () => {
    let finish;
    const read = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    const onChange = vi.fn();
    const stop = watchDraft({ read, baseline: BASE, onChange, isHidden: () => false });
    await advance(POLL_EVERY_MS); // read started, still running
    stop(); // user typed in the reply box
    finish(ROVO);
    await advance(POLL_EVERY_MS * 3);
    expect(onChange).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledTimes(1);
  });

  test('a failed read is ignored and the next tick tries again', async () => {
    let n = 0;
    const { onChange } = setup({ reads: () => { if (++n === 1) throw new Error('network'); return ROVO; } });
    await advance(POLL_EVERY_MS * 2);
    expect(onChange).toHaveBeenCalledWith(ROVO);
  });

  test('pageHidden is false when there is no document (UI Kit has no DOM)', () => {
    expect(typeof document).toBe('undefined');
    expect(pageHidden()).toBe(false);
  });
});
