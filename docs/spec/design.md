# Design and screens

Loop Closer has 4 screens built with Forge UI Kit (`@forge/react`), one Rovo agent and 2 MCP tools. All copy below is final text unless Rafli changes it.

## Design rules

1. **The waiting number comes first** on every screen.
2. **Every match shows why:** "Linked to LOOP-1" or "Match 72%: pdf, export, timeout".
3. **Nothing reaches a customer without a click,** and Send asks once to confirm.
4. **Native look:** only UI Kit components, no custom CSS.
5. **Every screen has a loading, empty and error state** (copy at the end of this tab).

UI Kit components used: `Heading`, `Text`, `Stack`, `Inline`, `Box`, `Lozenge`, `Badge`, `DynamicTable`, `Button`, `ButtonGroup`, `Tabs`, `Modal`, `TextArea`, `Select`, `Toggle`, `Textfield`, `SectionMessage`, `Spinner`, `EmptyState`. **VERIFY** each name with the Forge MCP server in Phase 2.

## Screen 1: Release list (Jira project page "Loop Closer")

- **Heading:** Loop Closer
- **Subtext:** Tell customers their fix has shipped.
- **Stat line (large):** "**10** customers waiting across **1** release"
- **Button (top right):** Scan a release, opens a modal with a `Select` of released versions and a Scan button.
- **Table** (newest release first):

| Column | Content |
| --- | --- |
| Release | Version name, link opens Screen 2 |
| Released | "3 days ago" |
| Bugs fixed | Number |
| Waiting | `Badge`, red if more than 0 |
| Sent | Number |
| Action | Button "Open" |

- **Tabs above the table:** Releases (default) | Still waiting (Screen 3).

## Screen 2: Release detail

- **Back link:** ← All releases
- **Heading:** Release 2.4
- **Subtext:** Released 3 days ago · 3 bugs fixed · 10 customers matched
- **Status line:** Lozenges "Waiting 8", "Sent 2", "Skipped 0", "Not related 0"
- **Filter tabs:** Waiting (default) | Sent | Skipped and not related
- **Table**, one row per request:

| Column | Content |
| --- | --- |
| Customer | First name, then request key as a link (opens the request in a new tab) |
| Their words | Request summary, cut at 80 characters |
| Fixed bug | Bug key and summary |
| Why | Lozenge "Linked" (green), or "Match 72%" (blue) plus up to 3 reason words in grey |
| Draft | First 60 characters, plus a small label: Template, Rovo or Edited |
| Actions | Buttons Send and Edit; a "More" menu with Improve with Rovo, Skip, Not related |

- **Send:** opens a confirm modal: "Send this reply to Ana? It will be visible to the customer on HELP-1." Buttons Cancel | Send reply. On success, a toast "Reply sent to Ana" and the row moves to the Sent tab.
- **Edit:** modal with the full draft in a `TextArea`, a word count ("64 / 120 words"), and buttons Cancel | Save | Save and send.
- **Improve with Rovo:** opens Rovo chat with the Loop Closer agent and the message "Improve the reply for HELP-5". **VERIFY** the bridge call that opens Rovo chat in Phase 3; if not possible, show the text to paste into chat.
- **Skip:** status Skipped, no message sent. **Not related:** status Not related, hidden from Waiting, never suggested again for this release.

## Screen 3: Still waiting (tab on Screen 1)

- **Stat line:** "**N** customers have not been told about a shipped fix"
- **Table**, oldest first: Release | Customer and request | Fixed bug | Days waiting | Button "Open release"
- Days waiting = days since the release date, shown red after 7 days.

## Screen 4: Settings (Jira admin page "Loop Closer settings")

| Field | Control | Default | Help text |
| --- | --- | --- | --- |
| Jira project with the fixes | Select (software projects) | none | Where your bugs and versions live |
| Service desk project | Select (service projects) | none | Where customers raise requests |
| Reply tone | Select: Friendly, Formal | Friendly | Used by templates and by Rovo |
| Resolve request after sending | Toggle | Off | Moves the request to the status below |
| Resolve status name | Textfield | Resolved | Must match a transition in your service desk |
| Match strictness | Select: Loose 0.25, Normal 0.35, Strict 0.5 | Normal | Higher means fewer, surer matches |
| Look back | Select: 90, 180, 365 days | 180 | How old a request can be to match |

- **Buttons:** Save settings | Test on a release (shows "This would match N requests" without saving).

## Reply templates (`src/lib/drafts.js`)

**Friendly:**

```
Hi {firstName},

Good news: the problem you told us about, "{requestSummary}", is fixed in our latest release ({releaseName}).

If you still see it, just reply here and we will take another look.

Thanks for letting us know,
{agentFirstName}
```

**Formal:**

```
Dear {firstName},

The issue you reported, "{requestSummary}", has been resolved in release {releaseName}.

If the problem continues, please reply to this request and we will investigate further.

Kind regards,
{agentFirstName}
```

`firstName` = first word of the reporter's display name; `agentFirstName` = first word of the current user's display name, filled at send time.

## Rovo agent: what a good conversation looks like

**User:** Who is still waiting on release 2.4?

**Agent:** 8 customers are still waiting on release 2.4:

- HELP-3 Chen (LOOP-3, CSV import)
- HELP-4 Dewi (LOOP-1, PDF export)
- ... You can review and send their replies in the Release Inbox.

**User:** Improve the reply for HELP-5.

**Agent:** (calls get-draft-context, writes, calls save-reply-draft) I saved a new draft for Eko on HELP-5. Review and send it in the Release Inbox. Here it is: "Hi Eko, ..."

## MCP tools: what a developer sees

- `get-waiting-customers` returns: `[{ "requestKey": "HELP-5", "customer": "Eko", "bugKey": "LOOP-1", "release": "2.4", "daysWaiting": 3 }]`
- `get-loop-status` returns: `{ "release": "2.4", "waiting": 8, "sent": 2, "skipped": 0, "notRelated": 0 }`
- Admin step: Atlassian Administration → Apps → Sites → your site → Connected apps → Loop Closer → turn on the tools.

## State copy (exact text)

| Screen | Loading | Empty | Error |
| --- | --- | --- | --- |
| Release list | Spinner + "Loading releases" | "No releases scanned yet. Release a version in your Jira project, or click Scan a release." | "Could not load releases: {message}" |
| Release detail | Spinner + "Loading customers" | "No customers matched this release. Try Loose match strictness in Settings." | "Could not load this release: {message}" |
| Still waiting | Spinner | "Everyone has been told. Nice work." | "Could not load: {message}" |
| Any screen, not configured | none | SectionMessage: "Loop Closer is not set up yet. Ask a Jira admin to choose projects in Loop Closer settings." | none |

## Mockups

Once Rafli approves this tab, Claude draws Screens 1 and 2 as mockups for one more review before Phase 2.
