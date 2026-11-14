# Build schedule and commits

The build runs in 8 phases, in this order. A phase is finished only when its "Done when" check passes on the demo site; then we commit and move on.

## Rules for every phase

- One task = one small change = one commit. Push to GitHub at the end of each working session.
- Before every `forge deploy`: run `forge lint` and `npm test`.
- If a phase gets stuck on the same problem after two tries, cut its nice-to-haves first, never a later phase.
- Rafli tests every "Done when" check himself on the demo site. Claude checks code and logs.
- We submit when Phase 7 passes, and before Devpost closes submissions.

## Phase 0: Setup

**Goal:** a starter app runs on the demo site, and the demo data exists.

- [ ] Rafli approves the Features, Design and Architecture tabs
- [ ] Setup tab steps 1 to 6 done, including 5b (WebStorm) and 5c (Claude Code)
- [ ] Replace the starter manifest with the one in the Architecture tab (modules can be empty stubs)
- [ ] Create the demo data exactly as in the Setup tab, step 7
- [ ] Add `CLAUDE.md` to the repo (text in the AI tools tab)

**Done when:** `forge deploy` and `forge install --demo-site` succeed, the Loop Closer page opens in the Jira project, and the starter agent answers in Rovo chat.

**Commits:**

- `chore: scaffold Forge app`
- `chore: add manifest skeleton, folder layout and CLAUDE.md`

## Phase 1: Scan engine

**Goal:** given a released version, the app finds and stores every matching customer request.

- [ ] `src/lib/jira.js`: `searchJql()`, `getFixedBugs(versionId)`, `getOpenRequests(jsmKey)`, `adfToText()`
- [ ] `src/lib/match.js`: `tokenize()`, `buildIdf()`, `scoreRequest()`, `matchRequests()` (algorithm in Architecture tab)
- [ ] `src/lib/store.js`: key helpers and `saveMatch()`, `listMatches(versionId)`, `saveRelease()`
- [ ] `src/lib/scan.js`: `scanRelease(versionId)` runs steps 1 to 6 of the scan
- [ ] `src/triggers/versionReleased.js`: calls `scanRelease` on `avi:jira:released:version`
- [ ] `test/match.test.js`: the 8 matcher tests listed in the Architecture tab

**Done when:** releasing demo version 2.4 writes 10 matches to storage (4 linked, 6 unlinked, 0 decoys), visible in `forge logs`, and all matcher tests pass.

**Commits:**

- `feat(jira): JQL search and ADF text helpers`
- `feat(match): keyword scoring with IDF weights`
- `test(match): linked, unlinked and decoy cases`
- `feat(storage): matches and release summaries in KVS`
- `feat(scan): scan a release end to end`
- `feat(trigger): run scan when a version is released`

## Phase 2: Release Inbox

**Goal:** a support agent can review and send replies from the Jira project page.

- [ ] Resolvers: `getReleases`, `getMatches`, `updateMatch`, `sendReply`, `rescanRelease`
- [ ] `src/lib/drafts.js`: `templateDraft(match, settings)` (template in Design tab)
- [ ] `src/lib/jsm.js`: `addPublicComment()`, `resolveRequest()`
- [ ] `src/frontend/inbox.jsx`: release list, release detail table, edit modal, send buttons (layout in Design tab)
- [ ] "Scan this release" button for versions released before install

**Done when:** on the demo site, Rafli opens release 2.4, edits one draft, sends it, and the customer-facing comment appears on that request; the request's row shows "Sent".

**Commits:**

- `feat(ui): release list with waiting counts`
- `feat(ui): release detail with reasons and drafts`
- `feat(send): post public reply and optional resolve`
- `feat(ui): manual rescan`

## Phase 3: Rovo agent

**Goal:** the Loop Closer agent answers questions and improves drafts.

- [ ] `src/actions/agentActions.js`: `getWaitingCustomers`, `getReleaseMatches`, `getDraftContext`, `saveReplyDraft`
- [ ] Agent prompt from the Architecture tab, in the manifest
- [ ] "Improve with Rovo" button opens Rovo chat with the agent (verify the bridge call at this step)

**Done when:** in Rovo chat, "Who is still waiting on release 2.4?" returns the correct names, and "Improve the reply for HELP-5" saves a new draft that shows in the inbox.

**Commits:**

- `feat(agent): loop closer agent and read actions`
- `feat(agent): save improved drafts`
- `feat(ui): open Rovo from the inbox`

## Phase 4: Still Waiting and Settings

- [ ] `src/frontend/inbox.jsx`: second tab "Still waiting"
- [ ] `src/frontend/admin.jsx`: settings form (fields in Design tab)
- [ ] Resolvers: `getSettings`, `saveSettings`, `getStillWaiting`

**Done when:** changing the service desk project in Settings changes what the next scan finds, and Still Waiting lists unsent matches oldest first.

**Commits:**

- `feat(ui): still waiting view`
- `feat(admin): settings page`

## Phase 5: MCP and Teamwork Graph

- [ ] `rovo:mcp` module exposing `get-waiting-customers` and `get-loop-status`
- [ ] Turn on outside access in Atlassian Administration and test from Claude (desktop or Code) as an MCP client
- [ ] Optional: Teamwork Graph owner hint in the inbox, with assignee fallback; drop it if calls fail often

**Done when:** an outside AI client lists the two tools and gets the correct waiting count for release 2.4.

**Commits:**

- `feat(mcp): expose loop status tools`
- `feat(graph): suggest support owner via Teamwork Graph` (only if kept)

## Phase 6: Polish

- [ ] Empty, loading and error states on every screen (copy in Design tab)
- [ ] "Create sample data" button for judges (creates 1 bug, 1 version, 2 requests)
- [ ] README written (outline in Submission tab)

**Done when:** a brand-new Jira project with no data shows friendly empty states, and the sample data button produces a working demo in under 2 minutes.

**Commits:**

- `fix(ui): empty, loading and error states`
- `feat(onboarding): sample data for judges`
- `docs: README with install and test steps`

## Phase 7: Prove and submit

- [ ] Create the install link (Developer Console, Distribution, start sharing)
- [ ] Fresh-account test: second Atlassian account, new site, install from the link, follow the judge steps
- [ ] Fix what the fresh test finds
- [ ] Record, edit and upload the video
- [ ] Fill every Devpost field, add screenshots, submit
- [ ] Tag the release in git

**Done when:** the Devpost page shows the video, the install link works from a logged-out browser, and the submission is marked submitted.

**Commits:**

- `fix: issues found in fresh install test`
- `chore(release): v1.0.0 for Codegeist 2026`

## Commit message style

`type(area): what changed`, lowercase, under 60 characters. Types: `feat`, `fix`, `test`, `docs`, `chore`. Never use `Co-authored-by: Claude Code`.
