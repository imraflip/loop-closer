import { describe, test, expect } from 'vitest';
import { canImproveWithRovo, canSend, changeText, draftBoxKey, draftParagraphs, improvePrompt, rovoOpenPayload, sentLabel, sharedWords } from '../src/frontend/components/format.js';

describe('changeText (reply box onChange)', () => {
  test('reads the text from an event or a plain string', () => {
    expect(changeText({ target: { value: 'Hi Ana' } })).toBe('Hi Ana');
    expect(changeText('pasted text')).toBe('pasted text');
    expect(changeText({ target: { value: '' } })).toBe('');
  });

  test('returns null (never undefined) when there is no text', () => {
    expect(changeText(undefined)).toBeNull();
    expect(changeText({})).toBeNull();
    expect(changeText({ target: {} })).toBeNull();
  });
});

describe('draftBoxKey (when the reply box remounts)', () => {
  const m = { requestKey: 'HELP-1', status: 'drafted', draft: 'Hi Ana' };

  test('same match and saved draft: same key, so typing is never reset', () => {
    expect(draftBoxKey({ ...m })).toBe(draftBoxKey(m));
  });

  test('another match, or a newly saved draft: new key, so the box shows it', () => {
    expect(draftBoxKey({ ...m, requestKey: 'HELP-2' })).not.toBe(draftBoxKey(m));
    expect(draftBoxKey({ ...m, draft: 'Hi Ana, edited' })).not.toBe(draftBoxKey(m));
  });
});

describe('canSend (Send and next button)', () => {
  test('disabled for empty or whitespace-only drafts, or while busy', () => {
    for (const d of ['', '   ', '\n\n', '\t ', undefined, null]) expect(canSend(d, false)).toBe(false);
    expect(canSend('Hi Ana', true)).toBe(false);
  });

  test('enabled for real text', () => {
    expect(canSend('Hi Ana', false)).toBe(true);
    expect(canSend('  x  ', false)).toBe(true);
  });
});

describe('draftParagraphs (read-only reply text)', () => {
  test('blank lines split paragraphs, single line breaks stay as lines', () => {
    expect(draftParagraphs('Hi Ana,\n\nIt is fixed.\nThanks!\n\nKind regards,\nRafli')).toEqual([
      ['Hi Ana,'], ['It is fixed.', 'Thanks!'], ['Kind regards,', 'Rafli'],
    ]);
  });

  test('handles \\r\\n, several blank lines and empty input', () => {
    expect(draftParagraphs('a\r\n\r\n\r\nb')).toEqual([['a'], ['b']]);
    expect(draftParagraphs('')).toEqual([]);
    expect(draftParagraphs(null)).toEqual([]);
  });
});

describe('sharedWords (original words display)', () => {
  test('shows the full words from reasonWords', () => {
    const match = { linked: false, reasons: ['logg', 'sett', 'dark'], reasonWords: { logg: 'logging', sett: 'settings', dark: 'dark' } };
    expect(sharedWords(match)).toEqual(['logging', 'settings', 'dark']);
  });

  test('old matches without reasonWords (or a missing entry) fall back to the stem', () => {
    expect(sharedWords({ linked: false, reasons: ['logg', 'sett'] })).toEqual(['logg', 'sett']);
    expect(sharedWords({ linked: false, reasons: ['logg', 'sett'], reasonWords: { logg: 'logging' } })).toEqual(['logging', 'sett']);
  });

  test('linked matches show no shared words', () => {
    expect(sharedWords({ linked: true, reasons: ['linked to LOOP-1'], reasonWords: {} })).toEqual([]);
  });
});

describe('sentLabel (viewer time zone)', () => {
  test('"Sent today" when sent earlier on the same local day', () => {
    const now = new Date(2026, 10, 15, 18, 0);
    expect(sentLabel(new Date(2026, 10, 15, 0, 5).toISOString(), now)).toBe('Sent today');
  });

  test('another local day shows the local date', () => {
    const now = new Date(2026, 10, 15, 0, 5);
    expect(sentLabel(new Date(2026, 10, 14, 23, 55).toISOString(), now)).toBe('Sent 2026-11-14');
    expect(sentLabel(new Date(2026, 0, 3, 12, 0).toISOString(), now)).toBe('Sent 2026-01-03');
  });

  test('uses the local date, not the UTC date (UTC+7 viewer)', () => {
    const before = process.env.TZ;
    process.env.TZ = 'Asia/Jakarta';
    try {
      // 20:00 UTC on 14 Nov is 03:00 on 15 Nov in Jakarta.
      expect(sentLabel('2026-11-14T20:00:00.000Z', new Date('2026-11-15T05:00:00.000Z'))).toBe('Sent today');
      expect(sentLabel('2026-11-14T20:00:00.000Z', new Date('2026-11-16T05:00:00.000Z'))).toBe('Sent 2026-11-15');
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  });

  test('missing or bad dates give no label', () => {
    expect(sentLabel(null)).toBeNull();
    expect(sentLabel('not a date')).toBeNull();
  });
});

describe('Improve with Rovo', () => {
  test('shown for waiting and drafted, hidden for sent, skipped and not related', () => {
    expect(canImproveWithRovo({ status: 'waiting' })).toBe(true);
    expect(canImproveWithRovo({ status: 'drafted' })).toBe(true);
    for (const status of ['sent', 'skipped', 'not_related', undefined]) expect(canImproveWithRovo({ status })).toBe(false);
    expect(canImproveWithRovo(null)).toBe(false);
  });

  test('prompt uses the real request key', () => {
    expect(improvePrompt('HELP-5')).toBe('Improve the reply for HELP-5');
    expect(improvePrompt('HELP-12')).toBe('Improve the reply for HELP-12');
  });

  test('opens our Loop Closer agent (manifest key and name) with that prompt', () => {
    expect(rovoOpenPayload({ requestKey: 'HELP-5', status: 'drafted' })).toEqual({
      type: 'forge', agentName: 'Loop Closer', agentKey: 'loop-closer-agent', prompt: 'Improve the reply for HELP-5',
    });
  });
});
