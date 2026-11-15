# Design and screens

Loop Closer has 4 screens built with Forge UI Kit (`@forge/react`), one Rovo agent and 2 MCP tools. All copy below is final text unless Rafli changes it.

## Design rules

1. **The waiting number comes first** on every screen.
2. **Every match shows why:** "Linked to LOOP-1" or "Likely match 72%: pdf, export, timeout".
3. **Nothing reaches a customer without a click,** and Send asks once to confirm.
4. **Native look:** only UI Kit components, no custom CSS.
5. **Every screen has a loading, empty and error state** (copy at the end of this tab).

UI Kit components used: `Heading`, `Text`, `Stack`, `Inline`, `Box`, `Lozenge`, `Badge`, `ProgressBar`, `DynamicTable`, `Button`, `ButtonGroup`, `Tabs`, `Modal`, `TextArea`, `Select`, `Toggle`, `Textfield`, `SectionMessage`, `Spinner`, `EmptyState`. **VERIFY** each name with the Forge MCP server in Phase 2.

## Screen 1: Release list (Jira project page "Loop Closer")

- **Heading:** Loop Closer
- **Subtext:** Tell customers their fix has shipped.
- **Stat tiles (three in a row):**
  - **Customers waiting:** number, red if more than 0
  - **Replies sent:** number
  - **Releases scanned:** number
- **Button (top right):** Scan a release, opens a modal with a `Select` of released versions and a Scan button.
- **Tabs:** Releases (default) and Still waiting (Screen 3), with a red count `Badge` on Still waiting.
- **Release cards** (newest release first), one card per release:
  - Title line: "Release 2.4 · 3 days ago · 3 bugs fixed"
  - Progress bar: "2 of 10 customers told"
  - Lozenge "8 waiting" (red)
  - Button "Open", opens Screen 2

## Screen 2: Release inbox (two columns)

- **Back link:** ← All releases
- **Heading:** Release 2.4
- **Header:** "3 bugs fixed · 10 customers matched" and a progress bar "2 of 10 told"
- **Tabs:** Waiting 8 (default) | Sent 2 | Skipped and not related

**Left column (about 40%):** one row per customer.

- First name, request key, request summary cut at 40 characters.
- Lozenge "Linked" (green) or "Likely 29%" (blue).
- The selected row is highlighted. On open, the first waiting customer is selected.

**Right column (about 60%):** the selected customer.

- Customer name and request key as a link (opens the request in a new tab).
- Lozenge "Linked to LOOP-1" or "Likely match 29%", plus up to 3 shared words.
- Two boxes: **They wrote** (the customer's request) and **Fixed in 2.4** (the fixed bug).
- Label "Reply to customer" with a small label: Template, Rovo or Edited.
- `TextArea` with the draft and a word count ("64 / 120 words").
- Buttons: Improve with Rovo, Skip, Not related (secondary) and **Send and next** (the one primary button).

**Behaviour:**

- **Editing:** no separate Edit modal. The draft is edited in the `TextArea`, the label changes to Edited, and it saves when another customer is clicked or Send and next is pressed.
- **Use template:** small subtle button next to the Template / Rovo / Edited label (Waiting tab only), shown when the reply is Edited, Rovo or empty. It replaces the draft with the template for the current tone and sets the label back to Template.
- **Send and next:** opens a confirm modal: "Send this reply to Ana? It will be visible to the customer on HELP-1." Buttons Cancel | Send reply. On success, a toast "Reply sent to Ana", the customer moves to the Sent tab and the next waiting customer opens. When none are left: "Everyone in this release has been told."
- **Improve with Rovo:** opens Rovo chat with the Loop Closer agent and the message "Improve the reply for HELP-5" (real request key), via `rovo.open({ type: "forge", agentName: "Loop Closer", agentKey: "loop-closer-agent", prompt })` from `@forge/bridge` (verified in Phase 3; supported in all Jira modules). Unsaved typing is saved first. Waiting tab only: hidden for sent, skipped and not related. If Rovo cannot open, an error message tells the user what to type in Rovo chat. After Rovo opens, the screen quietly re-reads that one match (`getMatch` resolver) every 3 seconds, with no spinner, and shows the new draft, label and counts with a "Rovo draft saved" toast as soon as the draft or its source changes. It stops when the user leaves the release, types in that reply box, acts on that request, the page is hidden (when the runtime exposes it), or after 60 seconds. `rovo.open` gives no event when the agent finishes, so this polls. Refresh stays.
- **Skip:** status Skipped, no message sent. **Not related:** status Not related, hidden from Waiting, never suggested again for this release. Both open the next waiting customer.
- **VERIFY** in Phase 2 that the two columns work in UI Kit; if not, stack them (list on top, selected customer below).

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
| Match strictness | Select: Loose 0.12, Normal 0.19, Strict 0.30 | Normal | Higher means fewer, surer matches |
| Look back | Select: 90, 180, 365 days | 180 | How old a request can be to match |

- **Buttons:** Save settings | Test on a release: pick any released version of the chosen Jira project (scanned or not); runs with the settings on the form and shows "This release would match 10 customers (4 linked)." without saving.

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

`firstName` = first word of the reporter's display name; `agentFirstName` = first word of the current user's display name, filled when the inbox shows the draft and again at send time; "Support" if the name cannot be read. Stored drafts keep the placeholder.

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
| Release inbox | Spinner + "Loading customers" | "No customers matched this release. Try Loose match strictness in Settings." | "Could not load this release: {message}" |
| Still waiting | Spinner | "Everyone has been told. Nice work." | "Could not load: {message}" |
| Any screen, not configured | none | SectionMessage: "Loop Closer is not set up yet. Ask a Jira admin to choose projects in Loop Closer settings." | none |

## Mockups

Once Rafli approves this tab, Claude draws Screens 1 and 2 as mockups for one more review before Phase 2.
