# Loop Closer – Codegeist 2026 build plan

@Rafli

## What we are building

**Loop Closer tells customers their bug is fixed, the day the fix ships.** When a Jira release goes out, it finds every service desk request about the fixed bugs, drafts a personal reply for each customer, and lets a support agent approve and send them in one click.

- **The problem:** support rarely knows when a fix ships. Requests sit open for weeks and customers think nobody listened.
- **Who it is for:** support teams and their leads using Jira Service Management alongside a Jira software project.
- **Category:** Business Teams (customer support). Software Teams is the second choice.
- **Bonus prizes to aim for:** Agents (a Rovo agent), MCP (a `rovo:mcp` server), Teamwork Graph (consume). We skip Marketplace, because a listed app cannot use an install link.
- **Not unique, but uncrowded:** a Devpost search for this problem found 6 projects and none doing it. Jira automation can already update *linked* requests; our edge is finding unlinked ones, personal replies, and the "still waiting" report.

## Why this idea

We only need one of this year's 33 winning slots (9 main prizes plus 24 bonus prizes), and past winners point to a clear shape.

- **Winners are finished tools for one everyday annoyance.** Images for Confluence, File Approvals, File Field Cloud and Issue Merger all placed. Few winners were "big AI brain" ideas.
- **Service desk apps place every year:** Runbook Rabbit (2024), SLA Insights (2024), Intelligent Helper (2023).
- **Rovo bonus winners almost always placed in a main category too.** In 2025, 5 of 6 Best Rovo Apps also won a main prize.
- **The 2026 crowd is in decision memory, release checks and handoffs.** About 144 entries were seen when we checked; none close the loop with customers.

One app that uses a Rovo agent, an MCP server and the Teamwork Graph properly competes in three bonus pools and one main category at once.

## Build order

1. Setup
2. Scan engine
3. Release Inbox
4. Rovo agent
5. Still Waiting and Settings
6. MCP and Teamwork Graph
7. Polish
8. Prove and submit

Each phase has its tasks, a "Done when" check and its commits in the Schedule tab. We work at our own pace, phase by phase. The only outside rules: submit before Devpost closes submissions, and keep the app working until judging ends.

## How this doc is organised

| Tab | What it holds |
| --- | --- |
| Features | Must-have and nice-to-have features, out of scope, the main user flow |
| Design | Each screen, the Rovo agent and the MCP tools, written for approval |
| Architecture | The build spec: manifest, files, storage, scan steps, matching, APIs, agent prompt |
| Setup | Ubuntu (WSL) and JetBrains steps with checks, and the exact demo data to create |
| Schedule & commits | 8 build phases in order, each with a done check and its commits |
| AI tools | Which AI tool to use for which job, and what to disclose |
| Submission | Devpost text, README, judge steps, video plan, final checks |
| Risks & sources | What could break, fallbacks, open questions, sources |

**Next step for Rafli:** read Features, Design and Architecture, then say OK or what to change. No code is written until you approve them.
