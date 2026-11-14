# Project setup

Every command below runs in your **Ubuntu (WSL) terminal**, not in PowerShell. The project files live inside Ubuntu, and you edit them with a **JetBrains IDE** that runs on Windows. Each step ends with a check; do not move on until the check passes. If anything fails, copy the whole error and paste it to Claude.

## Where things run

- **Commands** (node, npm, forge, git): the Ubuntu terminal.
- **Project files:** `~/projects/loop-closer` inside Ubuntu. Never put the project under `/mnt/c` (Windows drives); it is slow and breaks file watching.
- **Editor:** your JetBrains IDE on Windows, opening the Ubuntu folder.
- **Browser:** Chrome on Windows (for the demo site, GitHub and Devpost).

## 1. Check WSL and prepare Ubuntu

Once, in **Windows PowerShell**:

```powershell
wsl -l -v
```

- [x] Check: Ubuntu is listed and VERSION is 2. If VERSION is 1, run `wsl --set-version Ubuntu 2` (use the exact name from the list).
- [x] Open **Ubuntu** from the Start menu. From now on, every command is typed here.

In the Ubuntu terminal:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential unzip
mkdir -p ~/projects
cd ~/projects
pwd
```

- [ ] Check: `pwd` prints `/home/<your-linux-name>/projects`. Write your Linux name in the Setup notes at the bottom.

## 2. Install Node.js with nvm

We use nvm so that `npm install -g` works without sudo.

- [x] Open the **nvm-sh/nvm** page on GitHub, copy the install command from its README (it has the current version number in it), and run it in Ubuntu.
- [x] Close the Ubuntu window and open it again.

```bash
nvm install 22
nvm use 22
nvm alias default 22
node -v
npm -v
git --version
which node
```

- [x] Check: `node -v` prints v22.x.x, `npm -v` prints 10 or newer, and `git --version` prints a version. Forge needs Node 20 or newer.
- [x] Copy the output of `which node` into the Setup notes. The JetBrains IDE may ask for it.

## 3. Install the Forge CLI and log in

```bash
npm install -g @forge/cli@latest
forge --version
```

- [x] Check: `forge --version` prints a version number.
- [x] In Chrome, follow "Log in with an Atlassian API scoped token" on the [Forge getting started page](https://developer.atlassian.com/platform/forge/getting-started/) to create the token. Copy it right away; it is shown only once.

WSL has no keychain (`libsecret`), so `forge login` cannot save your token. Forge supports two environment variables instead: `FORGE_EMAIL` and `FORGE_API_TOKEN`. We keep them in one private file in your Ubuntu home folder, and load that file in every terminal. Do **not** run `forge login`.

**3a. Create the private file** (in the Ubuntu terminal, any folder):

```bash
nano ~/.forge-env
```

- [x] In the editor that opens, type these two lines. Put your real Atlassian email and the token you just created between the quotes:

```bash
export FORGE_EMAIL="your-atlassian-email@example.com"
export FORGE_API_TOKEN="paste-your-token-here"
```

- [x] Save and close nano: press **Ctrl+O**, then **Enter**, then **Ctrl+X**.
- [x] Make the file readable only by you:

```bash
chmod 600 ~/.forge-env
```

**3b. Load the file in every terminal**

```bash
echo 'source ~/.forge-env' >> ~/.bashrc
source ~/.bashrc
```

The first line adds one line to `~/.bashrc`, so every new Ubuntu terminal (also the WebStorm terminal and Claude Code) loads the two variables by itself. The second line loads them in the terminal you are using now.

**3c. Check**

```bash
echo "$FORGE_EMAIL"
[ -n "$FORGE_API_TOKEN" ] && echo "token is set"
forge whoami
```

- [x] The first line prints your email. The second prints `token is set`. Never print the token itself.
- [x] Check: `forge whoami` prints your name and email. If it says you are not logged in, paste the full output to Claude.
- [x] Open a new Ubuntu terminal tab and run `forge whoami` again. It must work there too, with nothing typed. This proves 3b worked.

**Rules for this file**

- The file is `~/.forge-env` in your home folder, **outside** the `loop-closer` project, so Git never sees it. Never copy the token into the project, into this doc, or into a chat.
- If the token leaks or you lose it, go to your Atlassian account's API tokens page, revoke it, create a new one, and replace the line in `~/.forge-env` with `nano ~/.forge-env`. Then run `source ~/.forge-env`.
- Temporary option, only if you do not want a file: run the next three lines in each new terminal. The values disappear when you close it.

```bash
read FORGE_EMAIL
read -s FORGE_API_TOKEN
export FORGE_EMAIL FORGE_API_TOKEN
```

## 4. Get the demo site

The demo site has enterprise Jira, Confluence, Jira Service Management and Rovo. Free developer sites often have no Rovo chat, so do not use one.

```bash
forge site provision
```

- [x] Write the printed site URL and expiry date in the Setup notes at the bottom of this tab.
- [x] Open the URL in Chrome on Windows and log in with the same Atlassian account.
- [x] Check: the Rovo chat button is visible in Jira's top bar, and you can create a project.
- [x] If it says no sites are available, wait an hour and run the command again.

**First screen on the demo site.** Jira shows "Let's get you where you need to be" with a list of spaces (for example Commercial Legal Service Desk, Core Experience, Design). Those are Atlassian's sample spaces. In Jira, a "space" is what used to be called a "project".

- [x] Do **not** click **Join space** on any of them. We do not use the sample data.
- [x] Click **Create a new space** (the last card). We make our own spaces in step 7a, with exact names and keys.
- [x] If you do not see this screen again later, open the Jira menu **Spaces, Create space** (the menu may be called Projects, Create project on your site).
- [x] Rovo check: look for the Rovo button or a **Rovo** link in the top bar or the left sidebar of Jira. Tell Claude what you see if you cannot find it.

## 5. Create the app and open it in your JetBrains IDE

```bash
cd ~/projects
forge create
```

`forge create` asks these questions, in this order. Type exactly what is shown:

- [x] **"Enter a name for your Developer Space"** (only the first time, because you have no space yet): type `loop-closer`. A Developer Space is only a container that holds your Forge apps. The name does not matter for the project.
- [x] **"Enter a name for your app"**: type `loop-closer`.

* [x] If Forge asks for the app name again: `loop-closer`
* [x] Category: **Rovo agent and action**. Template: **rovo-agent**.

- [x] Check, in Ubuntu: `ls ~/projects` shows a folder `loop-closer`. Inside it (`cd ~/projects/loop-closer`, then `ls`) you see `manifest.yml` and a `src` folder. If not, paste the full output to Claude. If the folder has another name, tell Claude before moving on.

```bash
cd ~/projects/loop-closer
npm install @forge/api @forge/resolver @forge/kvs @forge/react @forge/bridge
npm install -D vitest
forge deploy
forge install --demo-site
```

- [x] When `forge install` asks for permissions, accept.
- [x] Check: on the demo site, open Rovo chat, pick the agent from the agent list, say "hello", and it answers.

Useful while building (run in the Ubuntu terminal or the IDE terminal):

```bash
forge lint          # catches manifest mistakes before deploy
forge deploy        # pushes code to the development environment
forge install --upgrade --demo-site   # needed after adding scopes or modules
forge tunnel        # live reload while you test
forge logs          # shows console.log output and errors
```

If `forge tunnel` asks for Docker, stop and tell Claude. I have not verified how tunnel behaves inside WSL.

## 5b. Set up WebStorm for Ubuntu (WSL)

WebStorm stays installed on Windows. Your files and Node stay in Ubuntu. Open Settings with **Ctrl+Alt+S**. Menu names can differ a little between WebStorm versions, so tell me your version (Help, About) if something is missing. WebStorm already has JavaScript, JSX, YAML, Git and a terminal built in, so you do not need extra plugins for those.

- [x] **Open the project.** On the Welcome screen click **Open** (or **File, Open**), type `\\wsl.localhost\Ubuntu\home\<your-linux-name>\projects\loop-closer` and click OK. Click **Trust Project**. If your Ubuntu has another name, `wsl -l` in PowerShell shows it.
- [x] **Git.** WebStorm uses the Git inside Ubuntu for projects opened from a `\\wsl` path. Check: open the **Git** menu or the **Commit** window and it shows your changed files with no "Git not found" message.
- [x] **Terminal.** **Settings, Tools, Terminal, Shell path**: choose Ubuntu (the list shows your WSL distributions) or `wsl.exe`. Click Apply, then open the terminal with **Alt+F12**. Check: `pwd` prints `/home/<your-linux-name>/projects/loop-closer`, and `node -v` prints v22.
- [x] **Node interpreter.** **Settings, Languages & Frameworks, Node.js**. Next to **Node interpreter** click the `...` button, then **Add**, then **Add WSL**. Pick your Ubuntu, and paste the path from `which node` (it is in the Setup notes). Set **Package manager** to the npm inside Ubuntu. Check: the Node.js page shows the version as v22.x.x.
- [x] **JavaScript version.** **Settings, Languages & Frameworks, JavaScript**: set the language version to ECMAScript 2022 or newer, because we use `import` and `export`. If the Node.js page has a checkbox called "Coding assistance for Node.js", tick it.
- [x] **Keep it light.** WebStorm, Ubuntu, Chrome and Claude Code run at the same time. Close other heavy apps while we build. If the IDE is slow, tell me before changing any setting.
- [x] **Only if you run something from a WebStorm Run button and it cannot connect:** open **PowerShell as Administrator** and run the firewall rule from the JetBrains WSL page: `New-NetFirewallRule -DisplayName "WSL" -Direction Inbound -InterfaceAlias "vEthernet (WSL)" -Action Allow`. We run everything in the terminal, so you will probably never need this.

## 5c. Install Claude Code in Ubuntu and connect it to WebStorm

Claude Code needs a paid Claude plan (Pro, Max, Team or Enterprise) or a Claude Console account. The free plan does not include it. Install it **inside Ubuntu**, not in PowerShell. It does not need Node, and it updates itself.

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

- [x] Close the Ubuntu terminal and open a new one (or use a new terminal tab in WebStorm).
- [x] Check: `claude --version` prints a version number. Then run `claude doctor`; it should show no errors.
- [x] If it says `command not found`, run `echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc`, open a new terminal, and try again.

Log in once, in the project folder:

```bash
cd ~/projects/loop-closer
claude
```

- [x] Follow the login steps. If no browser opens by itself, copy the link it prints and open it in Chrome on Windows.
- [x] Check: Claude Code shows its prompt box. Type `/exit` to leave.

Install the WebStorm plugin (the plugin does not include Claude Code itself, which is why we installed it first):

- [x] **Settings, Plugins, Marketplace**, search **Claude Code \[Beta\]** (by Anthropic), click **Install**, then **close and reopen WebStorm completely**.
- [x] **Settings, Tools, Claude Code \[Beta\]**, set **Claude command** to `wsl -d Ubuntu -- bash -lic "claude"` (replace `Ubuntu` with your distribution name). This is what the plugin's Claude button and **Ctrl+Esc** use.
- [x] **Settings, Tools, Terminal**: untick "Move focus to the editor with Escape", so the Esc key can stop Claude when it goes the wrong way.
- [x] In the WebStorm terminal (Ubuntu), in the project folder, run `claude`, then type `/ide`. Check: it says it is connected to WebStorm.
- [x] Inside Claude Code run `/config` and set **Diff tool** to `auto`, so every code change opens in WebStorm's diff viewer and you can read it before you accept.
- [x] Keep Claude Code on the default, where it asks before each edit. The Claude Code docs warn that auto-approving edits in a JetBrains IDE is riskier. We review every change anyway.

If `/ide` says "No available IDEs detected" (common with WSL2), do one of these, then restart both WebStorm and Claude Code:

- [ ] **Option 1, firewall (works on Windows 10 and 11).** In Ubuntu run `hostname -I`. Take the first two numbers of the address and add `.0.0/16`; for `172.21.123.45` the range is `172.21.0.0/16`. In **PowerShell as Administrator** run the next line with your own range:

```powershell
New-NetFirewallRule -DisplayName "Allow WSL2 Internal Traffic" -Direction Inbound -Protocol TCP -Action Allow -RemoteAddress 172.21.0.0/16 -LocalAddress 172.21.0.0/16
```

- [ ] **Option 2, mirrored networking (Windows 11 22H2 or newer only).** Create or edit the file `.wslconfig` in your Windows user folder (`C:\Users\<your-windows-name>\.wslconfig`) and add these two lines, then run `wsl --shutdown` in PowerShell and open Ubuntu again:

```ini
[wsl2]
networkingMode=mirrored
```

- [ ] The Forge MCP server and `CLAUDE.md` are set up on the AI tools tab, one-time setup, items 2 and 3. Do those after this step.

## 6. Git and GitHub (with an SSH key)

```bash
git config --global user.name "Rafli"
git config --global user.email "YOUR_GITHUB_EMAIL"
git config --global init.defaultBranch main
ssh-keygen -t ed25519 -C "YOUR_GITHUB_EMAIL"
cat ~/.ssh/id_ed25519.pub
```

- [x] Press Enter on every question of `ssh-keygen` (default file, empty passphrase is fine for this project).
- [x] Copy the one line that `cat` printed. On github.com open **Settings, SSH and GPG keys, New SSH key**, and paste it.

```bash
ssh -T git@github.com
```

- [x] Check: it prints "Hi \<your-username>! You've successfully authenticated". Type `yes` if it asks about the host.
- [x] On github.com create a new **public** repository named `loop-closer`, with no README (the app already has files).

```bash
cd ~/projects/loop-closer
git init
git add .
git commit -m "chore: scaffold Forge app"
git branch -M main
git remote add origin git@github.com:YOUR_USERNAME/loop-closer.git
git push -u origin main
```

- [x] Check: the files show on GitHub, and `.gitignore` contains `node_modules`.

## 7. Demo data (create exactly this)

### 7a. Projects

Jira now says "space" where older pages say "project". It is the same thing. You need to be a Jira admin to create spaces; on your demo site you are. Do these parts in order. If a screen looks different from what is written here, take a screenshot and send it to Claude before you click.

**Part 1. The software space: Loop Demo (key LOOP)**

- [x] Close the welcome screen if it is still open.
- [x] In Chrome open `https://one-atlas-wwij.atlassian.net/jira/projects` (your demo site). It shows a table of all spaces. Click the blue **Create space** button at the **top right** of the page. (The big **Create a new space** button on the welcome screen does the same.)
- [x] In the template list, open the **Software development** category, pick the **Kanban** template, and click **Use template**.
- [x] If it asks for the space type, choose **Company-managed**. This matters: Jira components only exist in company-managed spaces, and we need components.
- [x] Name: `Loop Demo`.
- [x] Key: `LOOP`. Jira suggests a key by itself, for example `LD`. Click the key field (or **Advanced**) and change it to exactly `LOOP`. The key must start with a capital letter and use only capital letters or numbers.
- [x] Leave every other option as it is and click **Create**.
- [x] Check: a Kanban board opens, and the sidebar shows the space name Loop Demo.

**Turn on Releases** (this adds the Releases page and the Fix versions field)

- [x] Open the Loop Demo space. In its left sidebar, next to the space name, click the three dots **•••**, then **Space settings**. In the settings menu on the left click **Features**, and switch **Releases** on. You do not need any "+" button.
- [x] Check: a **Releases** item shows in the LOOP sidebar.

**Create the three components**

- [x] Open **Space settings** the same way (sidebar •••, then Space settings). In the settings menu on the left click **Components**, then **Create component**.
- [x] Create `Export`, then `Settings`, then `Import`. Names only, nothing else. Click **Create** or **Save** each time.
- [x] If Jira says the space uses Compass components, switch it to Jira components in the settings.
- [x] Check: the Components page lists exactly Export, Settings and Import.

**Create the version**

- [x] Go back to the Loop Demo board. The left sidebar now has **Releases** (it shows up after Releases is switched on; reload the page if you do not see it). Click it, then **Create version**. Name: `2.4`. Leave the dates empty. Click **Save**.
- [x] Check: 2.4 is listed with the status Unreleased. Do **not** click Release. We release it during the Phase 1 test.

**Part 2. The service space: Acme Help (key HELP)**

- [x] Open `https://one-atlas-wwij.atlassian.net/jira/projects` again and click **Create space** at the top right.
- [x] Open the **Service management** category (it may be under **Jira Service Management** in the apps list) and pick **Customer service management**. Do **not** pick IT service management: it does not allow "Raise a request" on behalf of a customer, and we need that.
- [x] Click **Use template**. If it asks for the space type, choose **Team-managed**.
- [x] Name: `Acme Help`.
- [x] Click **Advanced** and set the key to exactly `HELP`.
- [x] If it asks who can access the space, or what team will use it, keep the default or pick any option. Click **Create**.
- [x] Check: the left sidebar of Acme Help opens (All work page). It may not show a Raise a request link; that is fine, we use the Create button in 7c.

### 7b. Three bugs in LOOP (type Bug, Fix version 2.4)

Create the bugs one at a time, in the order of the table below, so the keys become LOOP-1, LOOP-2 and LOOP-3.

- [x] In Jira click **Create** in the top bar.
- [x] **Space:** Loop Demo. **Work type:** Bug. If the list has no Bug, stop and tell Claude.
- [x] **Summary:** copy it from the table. **Description:** copy it from the table.
- [x] **Component:** the one in the table. **Fix versions:** `2.4`. If you do not see these two fields on the form, tell Claude (the Releases or Components step above is missing).
- [x] Click **Create**.
- [x] Check: the keys are LOOP-1, LOOP-2 and LOOP-3, and sidebar **Releases**, then 2.4 shows 3 work items.

| Key | Summary | Description | Component |
| --- | --- | --- | --- |
| LOOP-1 | PDF export times out on large reports | Exporting a report with more than 200 rows to PDF times out after 30 seconds. | Export |
| LOOP-2 | Dark mode setting resets after logging in | Users who turn on dark mode find it switched back to the light theme after they log out and log back in. | Settings |
| LOOP-3 | CSV import removes accented characters | Importing a CSV file drops letters such as é, ü and ñ from customer names. | Import |

### 7c. Twelve requests in HELP

On this demo site Acme Help has no customer portal (the Portals page and Customer experiences page only show sample portals). So we create the requests with the blue Create button. Example.com addresses are safe test addresses.

Create the requests one at a time, in table order, so the keys become HELP-1 to HELP-12. Do HELP-1 completely first (steps 1 to 6), then repeat for the rest:

- [x] 1\. In Jira, click the blue **+ Create** button at the top of the page. A window called "Create" opens.
- [x] 2\. In the window, set **Space** to **Acme Help (HELP)**. Set **Work type** to **Problem**. Use the same Work type (Problem) for all 12 requests. Do not use Conversation.
- [x] 3\. In **Summary** type the Summary from the table. Scroll down in the window to **Description** and paste the Description from the table, exactly as written.
- [x] 4\. Keep scrolling down in the window and look for a field called **Reporter**, **Customer**, or **Raise this request on behalf of**. Click it, type the customer email from the table (for example `ana@example.com`), and choose that email. If it offers an option like "Create customer" or "Invite", choose that.
- [x] 5\. If you cannot find any of those three fields: STOP. Do not click Create. Take a screenshot of the lower half of the window and tell Claude. (Claude will then give you the Customers page steps.)
- [x] 6\. Click **Create**. A small message appears at the bottom with the key. Check: the first request must be **HELP-1**. If the key is different, stop and tell Claude. Do not continue.
- [x] 7\. For HELP-2 to HELP-12 you can tick **Create another** at the bottom left of the window before you click Create. Space and Work type stay. Summary, Description and the customer email must be changed every time. Before clicking Create each time, look at the customer field and make sure it shows the NEW email, not the one from the request before.
- [x] 8\. Emails to example.com go nowhere. That is fine.
- [x] 9\. Check at the end: open `https://one-atlas-wwij.atlassian.net/issues/?jql=project%20%3D%20HELP%20ORDER%20BY%20key%20ASC` in Chrome. It should list 12 work items, HELP-1 to HELP-12, and each one should show the correct customer. (If that address does not work, open Acme Help in the left sidebar, then Queues.)

| Key | Customer (email) | Summary | Description | Link |
| --- | --- | --- | --- | --- |
| HELP-1 | Ana (ana@example.com) | Can't export my monthly report to PDF | Every time I export the monthly report as PDF it spins and then says timeout. It is a big report. | relates to LOOP-1 |
| HELP-2 | Budi (budi@example.com) | Dark mode keeps turning off | I switch on dark mode but after I sign in the next day it is back to light. | relates to LOOP-2 |
| HELP-3 | Chen (chen@example.com) | Names with accents broken after import | We imported our customer list and names like José lost the accent letters. | relates to LOOP-3 |
| HELP-4 | Dewi (dewi@example.com) | PDF download fails for large exports | Large exports to PDF fail with a timeout message. | relates to LOOP-1 |
| HELP-5 | Eko (eko@example.com) | Report PDF never finishes | Exporting our sales report to PDF times out every time. Smaller reports are fine. | none |
| HELP-6 | Fatima (fatima@example.com) | Theme resets to light after login | Dark mode resets whenever I log in again. | none |
| HELP-7 | Gilang (gilang@example.com) | Import ruins customer names | After the CSV import, accented letters like é disappear from names. | none |
| HELP-8 | Hana (hana@example.com) | Timeout when exporting PDF | The PDF export of our yearly report times out. | none |
| HELP-9 | Ivan (ivan@example.com) | Dark mode setting not saved | The dark mode setting is not saved after logging out and in. | none |
| HELP-10 | Joko (joko@example.com) | CSV import drops ñ and ü | Our Spanish and German customer names lose letters when we import the CSV file. | none |
| HELP-11 | Kirana (kirana@example.com) | Export to Excel is slow | Excel export takes a long time but it does finish. | decoy |
| HELP-12 | Lukas (lukas@example.com) | How do I change my password? | I want to update my password after I log in. | decoy |

### 7d. Add the links

Only four requests get a link. They point from a bug to the request it relates to:

- [x] Open **LOOP-1**. Click **Link work item**, choose **relates to**, type `HELP-1`, select it, click **Link**. Then link `HELP-4` the same way.
- [x] Open **LOOP-2** and link it to `HELP-2` (relates to).
- [x] Open **LOOP-3** and link it to `HELP-3` (relates to).
- [x] Check: LOOP-1 shows two linked items (HELP-1, HELP-4), LOOP-2 shows HELP-2, LOOP-3 shows HELP-3. Link nothing else. HELP-5 to HELP-12 stay unlinked on purpose.
- [x] Tell Claude when 7a to 7d all pass.

* [x] Expected result after Phase 1: releasing 2.4 creates **10 matches** (HELP-1 to HELP-10) and **no match** for HELP-11 or HELP-12.
* [x] Nothing to do now. In Phase 1, Claude Code creates the file `test/fixtures.js` and puts these same texts in it, so the tests use identical data. The file does not exist yet, so you cannot find it.

## Setup notes (fill in)

- Demo site URL: <https://one-atlas-wwij.atlassian.net>
- Demo site expiry date: 2027-02-12
- App ID (from `manifest.yml` after `forge create`): ari:cloud:ecosystem::app/71b7bf22-6e01-4282-87ba-0e802009fec6
- GitHub repo URL: <https://github.com/imraflip/loop-closer/>
- Linux username in Ubuntu: imraflip
- Ubuntu name (from `wsl -l`): Ubuntu-26.04
- Node path (from `which node`): /home/imraflip/.nvm/versions/node/v22.23.5/bin/node
- JetBrains IDE name and version: WebStorm 2026.3
