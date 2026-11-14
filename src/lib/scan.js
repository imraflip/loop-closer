// findMatches(versionId) runs scan steps 1-6 and saves nothing.
// scanRelease(versionId) runs findMatches, then steps 7-8 (template drafts, save matches and release).
import { getVersion, getFixedBugs, getOpenRequests, getOpenRequestsByKeys, adfToText } from './jira.js';
import { matchRequests, DEFAULTS } from './match.js';
import { templateDraft } from './drafts.js';
import { getSettings, listMatches, saveMatch, saveRelease, countStatuses } from './store.js';

const DEFAULT_LOOKBACK_DAYS = 180;
const NO_NAME = 'there';
const PROTECTED = new Set(['sent', 'skipped', 'not_related']);

export const NOT_CONFIGURED = 'Loop Closer is not configured';
export const NO_BUGS = 'No fixed bugs found for this release';

// Jira issue -> the shape match.js scores.
export function toItem(issue) {
  const f = issue.fields || {};
  return {
    key: issue.key,
    summary: f.summary || '',
    description: adfToText(f.description),
    components: (f.components || []).map((c) => c.name),
  };
}

// Step 4: requestKey -> bugKey for links to the JSM project (first bug wins).
export function linkedRequests(bugIssues, jsmKey) {
  const linked = new Map();
  for (const bug of bugIssues) {
    for (const link of bug.fields?.issuelinks || []) {
      const other = link.inwardIssue || link.outwardIssue;
      if (other?.key?.startsWith(`${jsmKey}-`) && !linked.has(other.key)) linked.set(other.key, bug.key);
    }
  }
  return linked;
}

// Steps 4 and 6 without API calls. `requests` = step 5 results plus the extra linked search.
export function buildMatches({ versionId, releaseName, bugIssues, requests, jsmKey, threshold, minShared }) {
  const bugsByKey = new Map(bugIssues.map((b) => [b.key, b]));
  const requestsByKey = new Map(requests.map((r) => [r.key, r]));
  const linked = linkedRequests(bugIssues, jsmKey);

  const record = (request, bugKey, fields) => ({
    requestKey: request.key,
    bugKey,
    bugSummary: bugsByKey.get(bugKey)?.fields?.summary || '',
    versionId: String(versionId),
    releaseName,
    ...fields,
    customerName: request.fields?.reporter?.displayName || NO_NAME,
    customerAccountId: request.fields?.reporter?.accountId || null,
    requestSummary: request.fields?.summary || '',
    requestCreated: request.fields?.created || null,
  });

  const matches = [];
  for (const [requestKey, bugKey] of linked) {
    const request = requestsByKey.get(requestKey);
    if (!request) continue; // Done (or not visible): skip
    matches.push(record(request, bugKey, { linked: true, score: 1, reasons: [`linked to ${bugKey}`] }));
  }

  const unlinked = requests.filter((r) => !linked.has(r.key));
  const scored = matchRequests(bugIssues.map(toItem), unlinked.map(toItem), { threshold, minShared });
  for (const m of scored) {
    matches.push(record(requestsByKey.get(m.requestKey), m.bugKey, { linked: false, score: m.score, reasons: m.reasons }));
  }
  return matches;
}

// Steps 7 + 8 for one match. Returns the record to save, or null to leave the stored one alone.
// - sent, skipped, not_related: untouched.
// - new match, or "waiting" with no real draft (saved before drafts existed): template draft, status drafted.
// - anything else (drafted, or waiting with a draft): keep its status, draft and draftSource (edited/rovo too);
//   only the Jira fields (summary, bug, score, reasons, customer) are refreshed.
const templated = (fresh, settings) => ({
  ...fresh, status: 'drafted', draft: templateDraft(fresh, settings), draftSource: 'template', sentAt: null,
});

export function mergeMatch(existing, fresh, settings) {
  if (!existing) return templated(fresh, settings);
  if (PROTECTED.has(existing.status)) return null;
  if (existing.status === 'waiting' && !String(existing.draft ?? '').trim()) return templated(fresh, settings);
  return { ...fresh, status: existing.status, draft: existing.draft ?? null, draftSource: existing.draftSource ?? null, sentAt: null };
}

export async function findMatches(versionId, { asUser = false } = {}) {
  try {
    // 1. settings
    const settings = await getSettings();
    if (!settings?.jiraProjectKey || !settings?.jsmProjectKey) {
      console.log(NOT_CONFIGURED);
      return { ok: false, message: NOT_CONFIGURED };
    }
    const { jiraProjectKey, jsmProjectKey } = settings;
    const threshold = settings.threshold ?? DEFAULTS.threshold;
    const lookbackDays = settings.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;

    // 2. version (no separate project check; step 3 filters by project)
    const version = await getVersion(versionId, { asUser });

    // 3. fixed bugs
    const bugIssues = await getFixedBugs(versionId, jiraProjectKey, { asUser });
    if (bugIssues.length === 0) {
      console.log(`scan stopped: ${NO_BUGS} (version ${versionId})`);
      return { ok: false, message: NO_BUGS };
    }

    // 5. candidates, plus linked requests the candidate search missed
    const candidates = await getOpenRequests(jsmProjectKey, lookbackDays, { asUser });
    const found = new Set(candidates.map((r) => r.key));
    const missingLinked = [...linkedRequests(bugIssues, jsmProjectKey).keys()].filter((k) => !found.has(k));
    const extra = await getOpenRequestsByKeys(missingLinked, { asUser });

    // 4 + 6. linked and scored matches
    const matches = buildMatches({
      versionId,
      releaseName: version.name,
      bugIssues,
      requests: [...candidates, ...extra],
      jsmKey: jsmProjectKey,
      threshold,
      minShared: DEFAULTS.minShared,
    });

    return {
      ok: true,
      data: {
        release: {
          versionId: String(versionId),
          name: version.name,
          jiraProjectKey,
          releasedAt: version.releaseDate || new Date().toISOString().slice(0, 10),
          bugKeys: bugIssues.map((b) => b.key),
        },
        matches,
      },
    };
  } catch (err) {
    console.error(`scan failed for version ${versionId}: ${err.message}`);
    return { ok: false, message: err.message };
  }
}

export async function scanRelease(versionId, { asUser = false } = {}) {
  const found = await findMatches(versionId, { asUser });
  if (!found.ok) return found;
  const { release, matches } = found.data;

  try {
    // 7 + 8. draft and save matches (never overwrite sent / skipped / not_related or a saved draft), then the release
    const settings = await getSettings();
    const stored = new Map((await listMatches(versionId)).map((m) => [m.requestKey, m]));
    const toSave = [];
    for (const fresh of matches) {
      const merged = mergeMatch(stored.get(fresh.requestKey), fresh, settings);
      if (merged) {
        toSave.push(merged);
        stored.set(merged.requestKey, merged);
      }
    }
    await Promise.all(toSave.map(saveMatch));

    const saved = await saveRelease({
      ...release,
      scannedAt: new Date().toISOString(),
      counts: countStatuses([...stored.values()]),
    });
    const linkedCount = matches.filter((m) => m.linked).length;
    console.log(`scan done: ${release.bugKeys.length} bugs, ${matches.length} matches (${linkedCount} linked)`);
    return { ok: true, data: saved };
  } catch (err) {
    console.error(`scan save failed for version ${versionId}: ${err.message}`);
    return { ok: false, message: err.message };
  }
}
