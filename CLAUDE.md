# Loop Closer - rules for Claude Code

Project: Forge app for Codegeist 2026. The spec lives in docs/spec/ in this repo (overview.md, architecture.md, design.md, features.md, schedule.md, setup.md). Read overview.md at the start of every session, then the file that matches the task before you write code.
The person you work with is Rafli: explain in short, plain English.

## Always
- Follow docs/spec/architecture.md exactly: folder layout, manifest, KVS keys, scan steps, matching algorithm.
- Before using any Forge module, manifest field, scope, UI Kit component or bridge call, check it with the Forge MCP server. If it disagrees with the spec, stop and say so.
- Run `forge lint` and `npm test` before saying a task is done.
- Keep matching in plain JavaScript in src/lib/match.js. Pure functions, unit tested.
- Every resolver returns { ok: true, data } or { ok: false, message }.
- Make one small change per task, then suggest the commit message from docs/spec/schedule.md.

## Never
- Never call Forge LLM or any outside AI API or outside domain.
- Never post a comment to a customer except from the sendReply resolver after a user click.
- Never mark a match "sent" before the API returns 201.
- Never return customer emails from actions or MCP tools.
- Never add scopes that docs/spec/architecture.md does not list without asking.

## Commands
- Test: npm test
- Check the app: forge lint
- Deploy (Rafli runs this, not you): forge deploy
- Logs: forge logs

## Working style
- One task at a time. Wait for my OK before the next task.
- Show me what changed in plain words, then suggest the commit message.
- If a spec file and the code disagree, stop and tell me. Do not guess.
- If you are not sure about a Forge detail, say so. Do not make one up.
- Never add 'Co-authored-by: Claude Code' (or any Claude co-author line) to commit messages. Rafli makes the commits himself.

## Project facts
- Stack: plain JavaScript, Forge UI Kit.
- Local tools: Node 22 in Ubuntu. Forge runtime: nodejs24.x (see manifest.yml).
- Demo site and app id are in manifest.yml and docs/spec/setup.md.