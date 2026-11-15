// Matcher unit tests (the 8 cases in architecture.md).
import { describe, test, expect } from 'vitest';
import { tokenize, buildIdf, scoreRequest, matchRequests, originalWords, reasonWordsFor, DEFAULTS } from '../src/lib/match.js';
import { buildMatches, mergeMatch } from '../src/lib/scan.js';
import { BUGS, REQUESTS, UNLINKED, byKey, BUG_ISSUES, REQUEST_ISSUES } from './fixtures.js';

const scanArgs = (requests = REQUEST_ISSUES) => ({
  versionId: '10001', releaseName: '2.4', bugIssues: BUG_ISSUES, requests, jsmKey: 'HELP', ...DEFAULTS,
});

const docTokens = (item) => {
  const s = tokenize(item.summary);
  return [...s, ...s, ...tokenize(item.description)];
};
const idfFor = (requests) => buildIdf([...BUGS, ...requests].map(docTokens));

describe('matcher', () => {
  // 1 and 8 test scan.js / store.js behaviour (linked requests, rescans), which do not exist yet.
  test('1. a linked request gets score 1.0 and reason "linked to BUG-x"', () => {
    const m = buildMatches(scanArgs()).find((x) => x.requestKey === 'HELP-1');
    expect(m).toMatchObject({ bugKey: 'LOOP-1', linked: true, score: 1, reasons: ['linked to LOOP-1'] });
  });

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

  test('8. running the scan twice keeps a sent match as sent', () => {
    const fresh = buildMatches(scanArgs()).find((x) => x.requestKey === 'HELP-5');
    const first = mergeMatch(undefined, fresh, {});
    expect(first.status).toBe('drafted');
    const sent = { ...first, status: 'sent', sentAt: '2026-11-14T10:00:00.000Z' };
    expect(mergeMatch(sent, fresh, {})).toBeNull();
    for (const status of ['skipped', 'not_related']) expect(mergeMatch({ ...first, status }, fresh, {})).toBeNull();
  });
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

describe('scan pipeline on demo data (no API calls)', () => {
  test('10 matches: 4 linked, 6 unlinked, no decoys', () => {
    const matches = buildMatches(scanArgs());
    expect(matches).toHaveLength(10);
    expect(matches.filter((m) => m.linked).map((m) => m.requestKey).sort()).toEqual(['HELP-1', 'HELP-2', 'HELP-3', 'HELP-4']);
    expect(matches.map((m) => m.requestKey)).not.toContain('HELP-11');
    expect(matches.map((m) => m.requestKey)).not.toContain('HELP-12');
    expect(matches.every((m) => !('email' in m) && !('emailAddress' in m))).toBe(true);
  });

  test('a linked request that is Done (not in the results) is skipped', () => {
    const matches = buildMatches(scanArgs(REQUEST_ISSUES.filter((r) => r.key !== 'HELP-2')));
    expect(matches.map((m) => m.requestKey)).not.toContain('HELP-2');
  });

  test('a missing customer name is stored as "there"', () => {
    const requests = REQUEST_ISSUES.map((r) => (r.key === 'HELP-5' ? { ...r, fields: { ...r.fields, reporter: null } } : r));
    expect(buildMatches(scanArgs(requests)).find((m) => m.requestKey === 'HELP-5').customerName).toBe('there');
  });
});

describe('original words for display (reasonWords)', () => {
  test('maps each stem to the first full word, customer text before bug text', () => {
    const texts = ['Logging stops after settings change', 'dark mode logs', 'Logger settings reset'];
    const [logg, setting, dark] = tokenize('logging settings dark'); // stems: logg, setting, dark
    expect(originalWords([logg, setting, dark], texts)).toEqual({ [logg]: 'logging', [setting]: 'settings', [dark]: 'dark' });
  });

  test('stems not in any text are left out; empty texts do not crash', () => {
    expect(originalWords(['pdf', 'zzz'], [null, undefined, 'PDF export'])).toEqual({ pdf: 'pdf' });
  });

  test('scoring is unchanged: reasons stay stems, reasonWords holds the full words', () => {
    const bugs = [{ key: 'LOOP-9', summary: 'Logging settings lost in dark mode', description: '' }];
    const requests = [{ key: 'HELP-9', summary: 'Dark mode loses my logging settings', description: null }];
    const [m] = matchRequests(bugs, requests, { threshold: 0 });
    expect(m.reasons).toContain('logg'); // still a stem
    for (const s of m.reasons) expect(tokenize(m.reasonWords[s])).toEqual([s]);
    expect(m.reasonWords.logg).toBe('logging');
  });

  test('demo data: every unlinked match has a full word for each reason', () => {
    const unlinked = buildMatches(scanArgs()).filter((m) => !m.linked);
    expect(unlinked.length).toBeGreaterThan(0);
    for (const m of unlinked) {
      for (const s of m.reasons) expect(tokenize(m.reasonWords[s])).toEqual([s]);
    }
  });
});

describe('reasonWordsFor (old matches without reasonWords)', () => {
  const old = () => ({
    status: 'sent', linked: false, reasons: ['logg', 'setting', 'crash'],
    requestSummary: 'Logging settings vanish', bugSummary: 'Debug logging resets settings',
  });

  test('rebuilds full words from the stored summaries; a stem found in neither has no entry', () => {
    expect(reasonWordsFor(old())).toEqual({ logg: 'logging', setting: 'settings' });
  });

  test('a stored map is used as it is; linked matches get none', () => {
    expect(reasonWordsFor({ ...old(), reasonWords: { logg: 'logged' } })).toEqual({ logg: 'logged' });
    expect(reasonWordsFor({ linked: true, reasons: ['linked to LOOP-1'] })).toEqual({});
  });

  test('never changes the match it reads', () => {
    const match = old();
    reasonWordsFor(match);
    expect(match).toEqual(old());
  });
});
