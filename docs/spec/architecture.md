# Architecture and implementation

This tab is the build spec: Claude Code follows it exactly, and anything marked **VERIFY** is checked against the Forge docs or the Forge MCP server in the phase that uses it.

## Fixed design decisions

1. Everything runs on Atlassian. No outside servers, no `fetch` to other domains.
2. No Forge LLM calls (billed to us, no free allowance). AI comes only from the site's Rovo agent.
3. Matching is plain JavaScript, so every match has a score and a written reason.
4. Nothing is posted to a customer without a person clicking Send.
5. The core flow never depends on Preview features (`rovo:mcp`, Teamwork Graph). They are add-ons.

## Folder layout

```
loop-closer/
  manifest.yml
  package.json
  CLAUDE.md                     rules for Claude Code (AI tools tab)
  README.md
  src/
    index.js                    exports every handler named in the manifest
    resolvers/index.js          UI resolvers (Resolver from @forge/resolver)
    triggers/versionReleased.js
    actions/agentActions.js     Rovo actions, also used as MCP tools
    lib/jira.js                 Jira REST helpers + adfToText()
    lib/jsm.js                  service desk comment + transition
    lib/match.js                tokenize, IDF, scoring (pure functions)
    lib/scan.js                 scanRelease(versionId)
    lib/store.js                KVS keys and read/write helpers
    lib/drafts.js               templateDraft()
    frontend/inbox.jsx          project page (UI Kit, @forge/react)
    frontend/admin.jsx          settings page
  test/
    match.test.js
    fixtures.js                 the demo data texts from the Setup tab
```

Packages: `@forge/api`, `@forge/resolver`, `@forge/kvs`, `@forge/react`, `@forge/bridge`; dev: `vitest`.

## manifest.yml (target shape)

```yaml
modules:
  trigger:
    - key: on-version-released
      function: on-version-released-fn
      events:
        - avi:jira:released:version
  jira:projectPage:
    - key: loop-closer-inbox
      resource: inbox
      resolver:
        function: resolver-fn
      render: native
      title: Loop Closer
  jira:adminPage:
    - key: loop-closer-settings
      resource: admin
      resolver:
        function: resolver-fn
      render: native
      title: Loop Closer settings
      useAsConfig: true
  rovo:agent:
    - key: loop-closer-agent
      name: Loop Closer
      description: Tells you which customers are still waiting to hear that their bug is fixed, and helps write the replies.
      prompt: resource:agent-prompt;prompt.md   # VERIFY file-prompt syntax; else paste inline
      actions:
        - get-waiting-customers
        - get-release-matches
        - get-draft-context
        - save-reply-draft
        - get-loop-status
  action:
    - key: get-waiting-customers
      name: Get waiting customers
      function: action-waiting-fn
      actionVerb: GET
      description: Lists customer requests whose bug fix has shipped but who have not been told yet. Use for questions like "who is still waiting".
      inputs:
        releaseName:
          title: Release name
          type: string
          required: false
          description: Jira version name, for example 2.4. Leave empty for all releases.
    - key: get-release-matches
      name: Get release matches
      function: action-matches-fn
      actionVerb: GET
      description: Lists every customer request matched to a release, with status, score and reason.
      inputs:
        releaseName:
          title: Release name
          type: string
          required: true
          description: Jira version name, for example 2.4
    - key: get-draft-context
      name: Get draft context
      function: action-context-fn
      actionVerb: GET
      description: Returns what is needed to write a reply for one request - customer first name, their words, the bug fixed, the release, the tone.
      inputs:
        requestKey:
          title: Request key
          type: string
          required: true
          description: Service desk request key, for example HELP-5
    - key: save-reply-draft
      name: Save reply draft
      function: action-save-draft-fn
      actionVerb: UPDATE
      description: Saves an improved reply draft for one request so a person can review and send it in the Release Inbox. Never sends anything.
      inputs:
        requestKey:
          title: Request key
          type: string
          required: true
          description: Service desk request key
        draftText:
          title: Draft text
          type: string
          required: true
          description: The full reply text, plain words, under 120 words
    - key: get-loop-status
      name: Get loop status
      function: action-status-fn
      actionVerb: GET
      description: Counts told, waiting and skipped customers for a release.
      inputs:
        releaseName:
          title: Release name
          type: string
          required: false
          description: Jira version name. Leave empty for the latest release.
  rovo:mcp:
    - key: loop-closer-mcp
      name: Loop Closer
      tools:
        - get-waiting-customers
        - get-loop-status
  function:
    - key: resolver-fn
      handler: index.resolver
    - key: on-version-released-fn
      handler: index.onVersionReleased
    - key: action-waiting-fn
      handler: index.getWaitingCustomers
    - key: action-matches-fn
      handler: index.getReleaseMatches
    - key: action-context-fn
      handler: index.getDraftContext
    - key: action-save-draft-fn
      handler: index.saveReplyDraft
    - key: action-status-fn
      handler: index.getLoopStatus
resources:
  - key: inbox
    path: src/frontend/inbox.jsx
  - key: admin
    path: src/frontend/admin.jsx
  - key: agent-prompt
    path: prompts
permissions:
  scopes:
    - read:jira-work
    - write:jira-work
    - read:jira-user
    - read:servicedesk-request
    - write:servicedesk-request
    - storage:app
app:
  id: <filled by forge create>
  runtime:
    name: <keep what forge create generates>
```

Verified against Forge docs: the `trigger` event name and scope, `jira:projectPage` and `jira:adminPage` shapes, `action` fields, `rovo:mcp` with `tools`, the service desk scopes (`write:servicedesk-request` covers comments and transitions), `storage:app` for `@forge/kvs`. **VERIFY** in Phase 0 with `forge lint`: the file-based agent prompt syntax and whether `UPDATE` actions ask the user to confirm.

## Data stored (Forge KVS)

| Key | Value |
| --- | --- |
| `settings` | `{ jiraProjectKey, jsmProjectKey, tone, autoResolve, resolveStatusName, threshold, lookbackDays }`. tone is "friendly" or "formal" (default "friendly"); defaults `autoResolve: false`, `resolveStatusName: "Resolved"`, `threshold: 0.19`, `lookbackDays: 180`. The scan falls back to 0.19 and 180 if unset. |
| `release:<versionId>` | `{ versionId, name, jiraProjectKey, releasedAt, bugKeys: [], scannedAt, counts: { waiting, drafted, sent, skipped, notRelated } }` |
| `match:<versionId>:<requestKey>` | `{ requestKey, bugKey, bugSummary, versionId, releaseName, linked, score, reasons: [], reasonWords: {}, customerName, customerAccountId, requestSummary, requestCreated, status, draft, draftSource, sentAt }`. status is one of waiting, drafted, sent, skipped, not_related. draftSource is template, rovo or edited. `reasonWords` maps each reason stem to one full word for display (customer's text first, then the bug's); linked matches and matches saved before it existed have none, and the UI shows the stem. `daysWaiting` is not stored; compute it when reading. Release `counts` use `notRelated` for the not_related status. |

List a release's matches with `kvs.query().where('key', WhereConditions.beginsWith('match:<versionId>:'))`. Recalculate `counts` after every status change.

## The scan, step by step (`scanRelease(versionId, { asUser })`)

1. Read `settings`. If no projects are set, stop and log "Loop Closer is not configured".
2. `GET /rest/api/3/version/{versionId}` to get the name and release date. There is no separate project check: the API returns only `projectId`, and step 3 already limits the search to `project = <jiraKey>`, so a version from another project finds 0 bugs.
3. Fixed bugs: `POST /rest/api/3/search/jql` with `jql: project = <jiraKey> AND fixVersion = <versionId> AND issuetype = Bug`, `fields: [summary, description, components, issuelinks]`, `maxResults: 100`, follow `nextPageToken`. If it finds 0 bugs, stop and save nothing (no empty release records for other projects); a manual rescan returns "No fixed bugs found for this release".
4. Linked requests: from each bug's `issuelinks`, keep `inwardIssue` or `outwardIssue` whose key starts with `<jsmKey>-`. These get `linked: true`, `score: 1.0`, `reasons: ["linked to <bugKey>"]`.
5. Candidates: `POST /rest/api/3/search/jql` with `jql: project = <jsmKey> AND statusCategory != Done AND created >= -<lookbackDays>d`, `fields: [summary, description, reporter, created, components]`, up to 300 requests. Linked requests from step 4 that are not in these results get one extra search: `key in (<those keys>) AND statusCategory != Done`, same fields, no created limit. Linked requests that are Done are skipped. If a customer name is still missing, store `customerName: "there"` so the greeting reads "Hi there".
6. Score each candidate that is not already linked (algorithm below). Each request is matched to its single best bug. Keep it if `score >= threshold` and it shares at least 2 tokens.
7. For each kept request: build `draft = templateDraft(...)`, `status: "drafted"`, `draftSource: "template"`. Do not overwrite matches whose status is `sent`, `skipped` or `not_related` (rescans are safe).
8. Save each kept match: a new one as `status: "waiting"` with no draft; never overwrite `sent`, `skipped` or `not_related`. Then save the release record with counts and log `scan done: <n> bugs, <m> matches (<l> linked)`.

`findMatches(versionId, { asUser })` runs steps 1 to 6 and saves nothing (used by `testMatching`). `scanRelease(versionId, { asUser })` runs `findMatches`, then step 8. Step 7 (drafts) is added in Phase 2.

Descriptions arrive as Atlassian Document Format: `adfToText()` walks the nodes and joins every `text` value with spaces; `null` becomes `""`.

## Matching algorithm (`src/lib/match.js`)

- **tokenize(text):** lowercase; replace anything not a letter or digit with a space; split; drop tokens shorter than 3 characters; drop every word in the exact STOPWORDS list below; strip one ending in this order: `ing`, `ed`, `es`, `s` if the rest is 4 or more letters.
- **buildIdf(docs):** `idf(t) = ln(1 + N / df(t))` over all bug texts plus all candidate texts, where N is the number of documents.
- **scoreRequest(request, bug):** request tokens = tokens of summary (counted twice) + description; bug tokens = tokens of bug summary (counted twice) + description. `shared = unique tokens in both`. `score = sum(idf(shared)) / sqrt(sum(idf(unique bug tokens)) * sum(idf(unique request tokens)))`, with idf counted over the bugs plus the unlinked candidates, then add `0.15` if they share a component, cap at `1.0`. `reasons` = the 3 shared tokens with the highest idf. For display only, `originalWords()` maps each reason stem to the first full word with that stem in the request summary, request description, bug summary, then bug description.
- **Defaults:** threshold `0.19` (midpoint of the fixture gap: lowest true match HELP-5 0.289, highest non-match HELP-12 0.100), minimum 2 shared tokens. Tune only with the fixtures, never by eye on one example.

## Matcher tests (`test/match.test.js`)

1. A linked request gets score 1.0 and reason "linked to BUG-x".
2. HELP-5 ("Report PDF never finishes" + its description from the fixtures) matches LOOP-1 with reasons including `pdf` and `export`.
3. A decoy sharing only common words ("export to Excel is slow") scores below the threshold.
4. Stopwords and greetings alone never create a match.
5. "exporting", "exports" and "exported" all become `export`.
6. A request that fits two bugs is assigned only to the higher-scoring one.
7. Empty or `null` descriptions do not crash and fall back to the summary.
8. Running the scan twice keeps a `sent` match as `sent`.

## Atlassian API calls

| Purpose | Call | Runs as | Scope |
| --- | --- | --- | --- |
| Version name and project | `GET /rest/api/3/version/{id}` | app (trigger), user (rescan) | `read:jira-work` |
| Fixed bugs, candidate requests | `POST /rest/api/3/search/jql` | app / user | `read:jira-work` |
| Project list for Settings | `GET /rest/api/3/project/search` | user | `read:jira-work` |
| Send the reply | `POST /rest/servicedeskapi/request/{key}/comment` with `{ "body": text, "public": true }` | user (the agent becomes the author) | `write:servicedesk-request` |
| Find the resolve transition | `GET /rest/servicedeskapi/request/{key}/transition` | user | `read:servicedesk-request` |
| Resolve the request | `POST /rest/servicedeskapi/request/{key}/transition` with `{ "id": <transitionId> }` | user | `write:servicedesk-request` |

`/rest/api/3/search` (old) is removed from Jira Cloud; use only `/search/jql`.

## Rovo agent prompt (`prompts/prompt.md`)

```
You are Loop Closer. You help support teams tell customers that the bug they reported has been fixed.

What you can do:
- Say who is still waiting after a release: use get-waiting-customers.
- Show all matches for a release: use get-release-matches.
- Count told and waiting customers: use get-loop-status.
- Improve a reply: call get-draft-context, write the reply, then call save-reply-draft.

When you write a reply:
- Use the customer's first name.
- Say in one sentence that the problem they described is fixed, using their own words.
- Name the release. Say what to do if it still happens: reply to this request.
- Under 120 words. Plain, warm, no jargon, no ticket keys, no internal names, no promises about future features.
- Match the tone from get-draft-context (friendly or formal).
- Sign off with the first name of the person you are talking to, only the first name, never the full name.
  If you do not know their name, end with {agentFirstName} exactly as written; Loop Closer fills it in.

Rules:
- You never send replies. You only save drafts. Tell the user to review and send in the Release Inbox.
- When asked to improve or write a reply, always call get-draft-context first. If it returns ok false,
  tell the user its message in one short sentence and stop. Do not write a draft and do not call save-reply-draft.
- If a release is not found, say it has not been scanned and suggest "Scan this release" in the Release Inbox.
- Answer in short lists with request keys and customer names.
```

## Action handlers (`src/actions/agentActions.js`)

- Each handler receives `(payload, context)`; inputs are on the payload by input name. **VERIFY** the exact payload shape in Phase 3 with `forge logs`.
- Release lookup: find the stored `release:*` whose `name` matches `releaseName` ignoring case; if empty input, use the newest `releasedAt`.
- Return plain JSON under 100 KB: arrays of `{ requestKey, customerName, bugKey, days waiting, status }`. Never return customer emails.
- `saveReplyDraft`: trim to 1,500 characters, set `draft`, `draftSource: "rovo"`, `status: "drafted"`; refuse if the match is already `sent`.

## Teamwork Graph add-on (Phase 5, optional)

- Inbox only (graph calls run as the current user, never in the trigger).
- Idea: for each request, suggest who in support has worked with this customer or bug before.
- Scopes added only if built: `read:graph:issue:jira`, `read:graph:user:atlassian`.
- Any error or empty result falls back to the request's assignee, and the UI never shows a graph error.
- Drop it if more than 1 in 5 calls fail on the demo site.

## Error handling rules

- Every resolver returns `{ ok: true, data }` or `{ ok: false, message }`; the UI shows `message` in a SectionMessage.
- A failed send leaves the match as `drafted` and shows "Not sent: \<reason>". Never mark `sent` before the API returns 201.
- Function time limit (checked at the end of Phase 1): 25 seconds for normal function invocations. The Forge docs do not name product triggers explicitly, so this is not confirmed for triggers by name. The demo scan is small (about 4 Jira calls and 10 saves). For big projects the plan is to move the scan to an async event queue (consumer functions run up to 900 seconds).

## STOPWORDS (exact list for `src/lib/match.js`)

```js
export const STOPWORDS = new Set([
  'the','and','for','are','but','not','you','your','our','ours','all','any','can','had','has','have','her','his','him','was','were','one','out','use','who','why','how','what','when','where','which','with','this','that','these','those','there','their','them','they','then','than','from','into','onto','over','under','about','after','before','again','still','just','only','also','very','too','some','such','each','every','more','most','other','own','same','both','few','off','once','here','being','been','would','could','should','will','shall','may','might','must','does','did','doing','done','get','got','its','it\'s','itself','myself','yourself','please','help','thanks','thank','hello','dear','regards','issue','issues','problem','problems','ticket','request','team','support','cannot','cant','doesnt','dont','didnt','isnt','wont','know','need','want','like','seem','seems','time','times','today','yesterday','week','day','now','since','because','while','whenever','again'
]);
```

Words shorter than 3 letters are already dropped by `tokenize`. Do not add product words (pdf, export, csv, dark) to this list.

## Resolvers (`src/resolvers/index.js`)

All run as the current user. All return `{ ok, data }` or `{ ok: false, message }`.

| Name | Input | Output `data` | Atlassian calls |
| --- | --- | --- | --- |
| `getSettings` | none | settings object or `null` | KVS only |
| `saveSettings` | settings object | saved settings | KVS only |
| `listProjects` | none | `{ software: [{key, name}], service: [{key, name}] }` | `GET /rest/api/3/project/search?typeKey=software` and `?typeKey=service_desk` |
| `getReleases` | none | `[{ versionId, name, releasedAt, bugCount, waiting, sent }]`, newest first | KVS only |
| `listReleasedVersions` | none | released versions of the Jira project not scanned yet: `[{ id, name, releaseDate }]` | `GET /rest/api/3/project/{key}/versions` |
| `rescanRelease` | `{ versionId }` | release record | runs `scanRelease` |
| `testMatching` | `{ versionId }` | `{ count }`, saves nothing | runs scan steps 1 to 6 only |
| `getMatches` | \`{ versionId, tab: "waiting" | "sent" | "other" }\` |
| `updateMatch` | `{ versionId, requestKey, draft?, status? }` (status only `skipped`, `not_related`, `drafted`) | updated match | KVS only |
| `sendReply` | `{ versionId, requestKey }` | updated match with `status: "sent"` | comment API, then transition API if `autoResolve` |
| `getStillWaiting` | none | all matches with status `waiting` or `drafted`, oldest release first, with `daysWaiting` | KVS only |
| `createSampleData` | none | `{ bugKey, versionName: "LC-demo", requestKeys: [2 keys] }` | see below |

## Sample data button (`createSampleData`)

For judges, so they can test in 2 minutes. Uses the projects chosen in Settings.

1. Find the service desk id: `GET /rest/servicedeskapi/servicedesk`, pick the one whose `projectKey` is `jsmProjectKey`.
2. Pick the first request type: `GET /rest/servicedeskapi/servicedesk/{id}/requesttype`.
3. Create version: `POST /rest/api/3/version` with `{ name: "LC-demo", projectId }`. If it exists, reuse it.
4. Create bug: `POST /rest/api/3/issue`, type Bug, summary "Search results load very slowly on mobile", fix version LC-demo.
5. Create 2 requests: `POST /rest/servicedeskapi/request` with `{ serviceDeskId, requestTypeId, requestFieldValues: { summary, description } }`:
   - "Search is slow on my phone" / "Search results take ages to load on mobile."
   - "Mobile search results loading slowly" / "On the mobile app search loads very slowly."
6. Link the first request to the bug: `POST /rest/api/3/issueLink` with type "Relates".
7. Return the keys and show: "Sample data created. Now release version LC-demo on your project's Releases page."

Every request must have a request type: never create requests with `POST /rest/api/3/issue`, because the reply comment API (`POST /rest/servicedeskapi/request/{key}/comment`) returns 404 for work items without one. The current user becomes the reporter of both requests. **VERIFY** in Phase 6 that issue type "Bug" exists in the judge's project; if not, use the first available issue type.

## Screen code structure

`src/frontend/inbox.jsx`

```
App
  state: view ("list" | "release"), versionId, settings, toast
  on load: invoke("getSettings"); if null -> NotConfigured
  Tabs: Releases | Still waiting
    Releases -> ReleaseList (invoke getReleases, listReleasedVersions)
                 ScanModal (Select + Scan -> invoke rescanRelease)
             -> ReleaseDetail(versionId) (invoke getMatches by tab)
                 MatchRow -> EditModal (invoke updateMatch)
                          -> ConfirmSendModal (invoke sendReply)
                          -> More menu: Improve with Rovo, Skip, Not related
    Still waiting -> StillWaiting (invoke getStillWaiting)
```

`src/frontend/admin.jsx`

```
SettingsForm
  on load: invoke("getSettings"), invoke("listProjects")
  fields from the Design tab, Screen 4
  Save -> invoke("saveSettings"); Test on a release -> invoke("testMatching")
```

After every successful action, reload the current table so the numbers stay correct.

## Entry file (`src/index.js`)

```js
import Resolver from '@forge/resolver';
import { defineResolvers } from './resolvers';

const resolverInstance = new Resolver();
defineResolvers(resolverInstance);
export const resolver = resolverInstance.getDefinitions();

export { onVersionReleased } from './triggers/versionReleased';
export {
  getWaitingCustomers,
  getReleaseMatches,
  getDraftContext,
  saveReplyDraft,
  getLoopStatus,
} from './actions/agentActions';
```

## package.json additions

```json
{
  "scripts": {
    "test": "vitest run",
    "lint": "forge lint"
  }
}
```

`.gitignore` must contain `node_modules/` and `.env`.

## What is still not decided (on purpose)

- Exact UI Kit component names and the Rovo-open bridge call: checked with the Forge MCP server in Phases 2 and 3.
- The Teamwork Graph query for the owner hint (B2): chosen in Phase 5 from the curated queries list, only if B2 is kept.
- Matching threshold: set to 0.19 by the Phase 1 fixture tests (lowest true match 0.289, highest non-match 0.100). Re-check it on the sample data in Phase 6.
- Sample data scope (decide in Phase 6): `POST /rest/api/3/version` needs `manage:jira-project`, which is not in the scope list. Either add that scope, or have `createSampleData` ask the user to create the LC-demo version by hand.
