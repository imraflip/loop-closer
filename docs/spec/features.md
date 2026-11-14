# Features and scope

Version 1 has 12 must-have features, each with a check you can test on the demo site. Feature IDs (F1, F2...) are used in commits, tests and the Schedule tab.

## Who uses it

| Person | What they want | Where they use Loop Closer |
| --- | --- | --- |
| Support agent | Tell waiting customers fast, without hunting for them | Release Inbox, Rovo chat |
| Support lead | Know nobody was forgotten after a release | Still Waiting tab, Rovo chat |
| Developer | Know whether customers were told about their fix | MCP tools in their own AI tool |
| Jira admin | Connect the right projects once | Settings page |

## The main flow (what the demo shows)

1. A developer releases version **2.4** in the LOOP project.
2. Loop Closer scans: it finds the 3 bugs fixed in 2.4, the 4 linked requests, and 6 unlinked requests that describe the same problems.
3. Each of the 10 requests gets a ready draft reply from a template.
4. The support agent opens **Loop Closer** in the project, sees "10 customers waiting" on release 2.4, and opens it.
5. For each row they read the customer's words, the matched bug and the reason, then Send, Edit, Skip or Not related.
6. Optionally they click **Improve with Rovo** and the Loop Closer agent rewrites the draft in a warmer, personal way.
7. Sent replies appear on the request as public comments, so Jira emails the customer. The request can move to Resolved.
8. The number drops to 0. Still Waiting shows anything left behind from older releases.

## Must-have features

| ID | Feature | Done when (test on the demo site) | Phase |
| --- | --- | --- | --- |
| F1 | Scan when a version is released | Releasing 2.4 creates the release record and 10 matches within 1 minute | 1 |
| F2 | Manual "Scan this release" | A version released before install can be scanned from the inbox and gives the same 10 matches | 2 |
| F3 | Linked request matching | HELP-1 to HELP-4 show "Linked to LOOP-x" with score 100% | 1 |
| F4 | Unlinked request matching with reasons | HELP-5 to HELP-10 match the right bug with 3 reason words; HELP-11 and HELP-12 do not appear | 1 |
| F5 | Template draft for every match | Every match has a draft using the customer's first name, their summary and the release name | 2 |
| F6 | Review actions | Send, Edit, Skip and Not related each change the row status and the counts | 2 |
| F7 | Send as public comment | After Send, the request shows the reply as a customer-visible comment, and the row says Sent with time and sender | 2 |
| F8 | Optional resolve on send | With auto-resolve on in Settings, a sent request moves to Resolved; with it off, status stays | 2 |
| F9 | Rovo agent answers | "Who is still waiting on release 2.4?" lists the right request keys and names | 3 |
| F10 | Rovo improves a draft | "Improve the reply for HELP-5" saves a new draft that the inbox shows with the label "Rovo" | 3 |
| F11 | Still Waiting view | Lists every unsent match from all releases, oldest release first, with days waiting | 4 |
| F12 | Settings | Choosing projects, tone, auto-resolve and threshold is saved and used by the next scan | 4 |

## Bonus-prize features

| ID | Feature | Done when | Phase |
| --- | --- | --- | --- |
| B1 | MCP tools `get-waiting-customers` and `get-loop-status` | An outside AI client lists both tools and gets the right count for 2.4 | 5 |
| B2 | Teamwork Graph owner hint (optional) | Each row shows "Suggested owner" from the graph, or the assignee if the graph gives nothing | 5 |

## Nice-to-have (only after F1 to F12 and B1 pass)

| ID | Feature |
| --- | --- |
| N1 | "Create sample data" button for judges (required anyway: the judge steps use it; built in Phase 6, spec in Architecture tab) |
| N2 | Panel on each bug: "3 customers are waiting on this fix" |
| N3 | Send all approved drafts in one click |
| N4 | Learn from "Not related" clicks: never suggest that pair again |

## Out of scope for version 1

- Sending email or chat messages outside Jira. The service desk already emails customers when a public comment is added.
- Any AI service outside Atlassian, and Forge LLM (cost and data reasons).
- Marketplace listing (it would block the install link that judges use).
- Writing to the Teamwork Graph (the API is read-only).
- Languages other than English for replies.
