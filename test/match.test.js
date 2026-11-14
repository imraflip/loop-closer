// Matcher unit tests (the 8 cases in architecture.md).
import { describe, test, expect } from 'vitest';
import { tokenize, buildIdf, scoreRequest, matchRequests, DEFAULTS } from '../src/lib/match.js';
import { BUGS, REQUESTS, UNLINKED, byKey } from './fixtures.js';

const docTokens = (item) => {
  const s = tokenize(item.summary);
  return [...s, ...s, ...tokenize(item.description)];
};
const idfFor = (requests) => buildIdf([...BUGS, ...requests].map(docTokens));

describe('matcher', () => {
  // 1 and 8 test scan.js / store.js behaviour (linked requests, rescans), which do not exist yet.
  test.todo('1. a linked request gets score 1.0 and reason "linked to BUG-x"');

  test('2. HELP-5 "Report PDF never finishes" matches LOOP-1 with reasons pdf and export', () => {
    const matches = matchRequests(BUGS, UNLINKED);
    const m = matches.find((x) => x.requestKey === 'HELP-5');
    expect(m).toBeDefined();
    expect(m.bugKey).toBe('LOOP-1');
    expect(m.linked).toBe(false);
    expect(m.reasons).toEqual(expect.arrayContaining(['pdf', 'export']));
  });

  test('3. decoy "Export to Excel is slow" scores below the threshold against every bug', () => {
    const idf = idfFor(UNLINKED);
    for (const bug of BUGS) {
      expect(scoreRequest(byKey('HELP-11'), bug, idf).score).toBeLessThan(DEFAULTS.threshold);
    }
    expect(matchRequests(BUGS, UNLINKED).map((m) => m.requestKey)).not.toContain('HELP-11');
  });

  test('4. stopwords and greetings alone never create a match', () => {
    const greeting = {
      key: 'HELP-99',
      summary: 'Hello, please help',
      description: 'Dear support team, thanks for your help with this issue. Regards',
    };
    expect(tokenize(`${greeting.summary} ${greeting.description}`)).toEqual([]);
    expect(matchRequests(BUGS, [...UNLINKED, greeting]).map((m) => m.requestKey)).not.toContain('HELP-99');
  });

  test('5. "exporting", "exports" and "exported" all become export', () => {
    expect(tokenize('exporting exports exported')).toEqual(['export', 'export', 'export']);
  });

  test('6. a request that fits two bugs is assigned only to the higher-scoring one', () => {
    const both = {
      key: 'HELP-98',
      summary: 'PDF export times out and dark mode resets',
      description: 'Large PDF reports time out. Also dark mode setting resets after login.',
    };
    const requests = [...UNLINKED, both];
    const idf = idfFor(requests);
    const s1 = scoreRequest(both, BUGS[0], idf).score;
    const s2 = scoreRequest(both, BUGS[1], idf).score;
    expect(s1).not.toBe(s2);

    const found = matchRequests(BUGS, requests).filter((m) => m.requestKey === 'HELP-98');
    expect(found).toHaveLength(1);
    expect(found[0].bugKey).toBe(s1 > s2 ? 'LOOP-1' : 'LOOP-2');
  });

  test('7. empty or null descriptions do not crash and fall back to the summary', () => {
    const nullDesc = { key: 'HELP-97', summary: 'PDF export times out on large reports', description: null };
    const emptyDesc = { key: 'HELP-96', summary: 'PDF export times out on large reports', description: '' };
    const noDesc = { key: 'HELP-95', summary: 'PDF export times out on large reports' };
    const matches = matchRequests(BUGS, [...UNLINKED, nullDesc, emptyDesc, noDesc]);
    for (const key of ['HELP-97', 'HELP-96', 'HELP-95']) {
      expect(matches.find((m) => m.requestKey === key)?.bugKey).toBe('LOOP-1');
    }
  });

  test.todo('8. running the scan twice keeps a sent match as sent');
});

describe('demo data (Phase 1 done check)', () => {
  test('HELP-5 to HELP-10 match the right bug; HELP-11 and HELP-12 do not match', () => {
    const got = Object.fromEntries(matchRequests(BUGS, UNLINKED).map((m) => [m.requestKey, m.bugKey]));
    expect(got).toEqual({
      'HELP-5': 'LOOP-1',
      'HELP-6': 'LOOP-2',
      'HELP-7': 'LOOP-3',
      'HELP-8': 'LOOP-1',
      'HELP-9': 'LOOP-2',
      'HELP-10': 'LOOP-3',
    });
  });

  test('fixtures have 12 requests, 4 linked', () => {
    expect(REQUESTS).toHaveLength(12);
    expect(REQUESTS.filter((r) => r.linkedTo)).toHaveLength(4);
  });
});
