import { describe, test, expect } from 'vitest';
import { templateDraft, wordCount, fillAgentName, MAX_WORDS, AGENT_PLACEHOLDER } from '../src/lib/drafts.js';
import { mergeMatch } from '../src/lib/scan.js';

const match = { customerName: 'Eko Prasetyo', requestSummary: 'Report PDF never finishes', releaseName: '2.4' };

describe('templateDraft', () => {
  test('friendly text is exact (default tone)', () => {
    const want =
      'Hi Eko,\n\n' +
      'Good news: the problem you told us about, "Report PDF never finishes", is fixed in our latest release (2.4).\n\n' +
      'If you still see it, just reply here and we will take another look.\n\n' +
      'Thanks for letting us know,\n{agentFirstName}';
    expect(templateDraft(match, { tone: 'friendly' })).toBe(want);
    expect(templateDraft(match, {})).toBe(want);
    expect(templateDraft(match, undefined)).toBe(want);
  });

  test('formal text is exact', () => {
    expect(templateDraft(match, { tone: 'formal' })).toBe(
      'Dear Eko,\n\n' +
        'The issue you reported, "Report PDF never finishes", has been resolved in release 2.4.\n\n' +
        'If the problem continues, please reply to this request and we will investigate further.\n\n' +
        'Kind regards,\n{agentFirstName}',
    );
  });

  test('a name with accents keeps its accents', () => {
    expect(templateDraft({ ...match, customerName: 'Zoë Müller-Łukasz' }, {})).toMatch(/^Hi Zoë,\n/);
    expect(templateDraft({ ...match, customerName: '  Ångström  ' }, { tone: 'formal' })).toMatch(/^Dear Ångström,\n/);
  });

  test('missing name reads "Hi there"', () => {
    expect(templateDraft({ ...match, customerName: 'there' }, {})).toMatch(/^Hi there,\n/);
    expect(templateDraft({ ...match, customerName: null }, {})).toMatch(/^Hi there,\n/);
  });

  test('a very long summary is cut so the draft stays within the word limit', () => {
    const long = Array.from({ length: 300 }, (_, i) => `word${i}`).join(' ');
    for (const tone of ['friendly', 'formal']) {
      const draft = templateDraft({ ...match, requestSummary: long }, { tone });
      expect(wordCount(draft)).toBeLessThanOrEqual(MAX_WORDS);
      expect(draft).toContain('word0 word1');
      expect(draft).toContain('word59…"');
      expect(draft).not.toContain('word60');
      expect(draft.endsWith(AGENT_PLACEHOLDER)).toBe(true);
    }
  });

  test('a normal summary is never cut', () => {
    expect(templateDraft(match, {})).not.toContain('…');
  });
});

describe('wordCount', () => {
  test('counts words split by any whitespace', () => {
    expect(wordCount('Hi Eko,\n\nGood  news')).toBe(4);
    expect(wordCount('')).toBe(0);
    expect(wordCount(null)).toBe(0);
  });
});

describe('fillAgentName', () => {
  test('fills the first name in any draft, including edited and Rovo ones', () => {
    expect(fillAgentName(templateDraft(match, {}), 'Rafli Permana')).toMatch(/Thanks for letting us know,\nRafli$/);
    expect(fillAgentName('Hi Eko, all fixed.\nCheers,\n{agentFirstName}', 'Siti')).toBe('Hi Eko, all fixed.\nCheers,\nSiti');
    expect(fillAgentName('No placeholder here', 'Siti')).toBe('No placeholder here');
  });

  test('no agent name removes the placeholder', () => {
    expect(fillAgentName('Kind regards,\n{agentFirstName}', '')).toBe('Kind regards,');
  });
});

describe('mergeMatch drafts (scan step 7)', () => {
  const fresh = { requestKey: 'HELP-5', ...match };

  test('a new match gets a template draft and status drafted', () => {
    const m = mergeMatch(undefined, fresh, { tone: 'formal' });
    expect(m).toMatchObject({ status: 'drafted', draftSource: 'template' });
    expect(m.draft).toMatch(/^Dear Eko,/);
  });

  test('a waiting match with no draft gets a template draft', () => {
    const m = mergeMatch({ ...fresh, status: 'waiting', draft: null, draftSource: null }, fresh, {});
    expect(m).toMatchObject({ status: 'drafted', draftSource: 'template' });
  });

  test('a saved, edited or Rovo draft is never overwritten', () => {
    for (const draftSource of ['template', 'edited', 'rovo']) {
      const existing = { ...fresh, status: 'drafted', draft: 'my own words', draftSource };
      expect(mergeMatch(existing, fresh, { tone: 'formal' })).toMatchObject({ draft: 'my own words', draftSource, status: 'drafted' });
    }
  });
});
