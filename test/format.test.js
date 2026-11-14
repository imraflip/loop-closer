import { describe, test, expect } from 'vitest';
import { canSend, changeText, draftBoxKey, draftParagraphs } from '../src/frontend/components/format.js';

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
