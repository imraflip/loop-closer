// Matching: tokenize, IDF and scoring. Pure functions only.
//
// Shapes (built by scan.js from Jira issues):
//   bug     = { key, summary, description, components }  description is plain text (adfToText)
//   request = { key, summary, description, components }
//   components = array of names or of { name }

export const STOPWORDS = new Set([
  'the','and','for','are','but','not','you','your','our','ours','all','any','can','had','has','have','her','his','him','was','were','one','out','use','who','why','how','what','when','where','which','with','this','that','these','those','there','their','them','they','then','than','from','into','onto','over','under','about','after','before','again','still','just','only','also','very','too','some','such','each','every','more','most','other','own','same','both','few','off','once','here','being','been','would','could','should','will','shall','may','might','must','does','did','doing','done','get','got','its','it\'s','itself','myself','yourself','please','help','thanks','thank','hello','dear','regards','issue','issues','problem','problems','ticket','request','team','support','cannot','cant','doesnt','dont','didnt','isnt','wont','know','need','want','like','seem','seems','time','times','today','yesterday','week','day','now','since','because','while','whenever','again'
]);

const ENDINGS = ['ing', 'ed', 'es', 's'];
const COMPONENT_BONUS = 0.15;
export const DEFAULTS = { threshold: 0.19, minShared: 2 };

function stem(token) {
  for (const end of ENDINGS) {
    if (token.endsWith(end) && token.length - end.length >= 4) {
      return token.slice(0, -end.length);
    }
  }
  return token;
}

// Same steps as tokenize(), but keeps the word before stemming: [{ word, stem }] in text order.
export function tokenWords(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
    .map((word) => ({ word, stem: stem(word) }));
}

export function tokenize(text) {
  return tokenWords(text).map((t) => t.stem);
}

// For display only (scoring uses stems): stem -> the first full word with that stem,
// looking through `texts` in order. Stems not found in any text are left out.
export function originalWords(stems, texts) {
  const wanted = new Set(stems);
  const words = {};
  for (const text of texts) {
    for (const { word, stem: s } of tokenWords(text)) {
      if (wanted.has(s) && !(s in words)) words[s] = word;
    }
  }
  return words;
}

// Summary counted twice + description.
function docTokens(item) {
  const summary = tokenize(item?.summary);
  return [...summary, ...summary, ...tokenize(item?.description)];
}

// docs: array of token arrays. Returns Map token -> ln(1 + N / df).
export function buildIdf(docs) {
  const n = docs.length;
  const df = new Map();
  for (const tokens of docs) {
    for (const t of new Set(tokens)) df.set(t, (df.get(t) || 0) + 1);
  }
  const idf = new Map();
  for (const [t, count] of df) idf.set(t, Math.log(1 + n / count));
  return idf;
}

function componentNames(item) {
  return new Set(
    (item?.components || [])
      .map((c) => (typeof c === 'string' ? c : c?.name))
      .filter(Boolean)
      .map((name) => name.toLowerCase()),
  );
}

// Returns { score, shared, reasons }. `idf` comes from buildIdf().
export function scoreRequest(request, bug, idf) {
  const weight = (t) => idf.get(t) || 0;
  const reqTokens = new Set(docTokens(request));
  const bugTokens = new Set(docTokens(bug));
  const shared = [...bugTokens].filter((t) => reqTokens.has(t));

  // shared weight / sqrt(bug weight * request weight)
  const total = (tokens) => [...tokens].reduce((sum, t) => sum + weight(t), 0);
  const norm = Math.sqrt(total(bugTokens) * total(reqTokens));
  let score = norm > 0 ? total(shared) / norm : 0;

  const reqComponents = componentNames(request);
  if ([...componentNames(bug)].some((c) => reqComponents.has(c))) score += COMPONENT_BONUS;
  score = Math.min(score, 1);

  const reasons = [...shared]
    .sort((a, b) => weight(b) - weight(a) || a.localeCompare(b))
    .slice(0, 3);
  return { score, shared, reasons };
}

// Each request goes to its single best bug; keep it if it clears the threshold
// and shares at least minShared tokens.
export function matchRequests(bugs, requests, { threshold = DEFAULTS.threshold, minShared = DEFAULTS.minShared } = {}) {
  const idf = buildIdf([...bugs, ...requests].map(docTokens));
  const matches = [];
  for (const request of requests) {
    let best = null;
    for (const bug of bugs) {
      const result = scoreRequest(request, bug, idf);
      if (!best || result.score > best.score) best = { bug, ...result };
    }
    if (best && best.score >= threshold && best.shared.length >= minShared) {
      matches.push({
        requestKey: request.key,
        bugKey: best.bug.key,
        score: best.score,
        reasons: best.reasons,
        // Customer's words first, then the bug's: "logg" -> "logging".
        reasonWords: originalWords(best.reasons, [request.summary, request.description, best.bug.summary, best.bug.description]),
        linked: false,
      });
    }
  }
  return matches;
}
