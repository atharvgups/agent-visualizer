# Agent Visualizer skills

Four portable skills, one job each. They encode the workflows in this repo: file a plan as a diagram, steer it while it runs, read parallel status, and replay the log. Each folder is a standard Agent Skills package (SKILL.md plus helpers) that Agensi accepts.

List them as four separate marketplace items. Do not upload this whole `skills/` folder as one ZIP unless you want a skill pack. Agensi treats two or more SKILL.md files in a ZIP as a pack.

Copy below is ready to paste into agensi.io/dashboard/submit. It stays short on purpose. No account was created from this repo.

## Shared install (local, any agent)

Copy one skill folder into the agent's skills directory. The folder name must match the `name` in SKILL.md.

- Cursor: `.cursor/skills/<slug>/` in the project, or `~/.cursor/skills/<slug>/` for you only
- Claude Code: `.claude/skills/<slug>/` or `~/.claude/skills/<slug>/`
- Codex CLI: `.codex/skills/<slug>/`
- Other SKILL.md agents: the project's `.agents/skills/<slug>/` directory is the usual project-level path

Python 3 is optional. The agent can follow SKILL.md without it. The helper scripts use the standard library only and never open the network.

## Shared install (Agensi, once a listing is live)

1. In the agent, connect Agensi: `connect mcp.agensi.io` (or paste `https://mcp.agensi.io/mcp/auth`).
2. Ask it to find the listing by title and use it.
3. Approve the purchase if it is paid. The agent loads the current SKILL.md on each use. You do not copy files by hand.

Buyers never get a download. Agensi serves the skill through MCP.

---

## 1. Delegated Work Flight Plan

**Slug:** `delegated-work-flight-plan`

**Listing title:** Delegated Work Flight Plan

**Suggested price:** $12 one-time (keep 70%). Price at $5 or above so buyers can pay by card. Free is fine if you want installs first.

**Suggested categories:** Productivity, AI Agents, Documentation (first category is the page it appears on). Confirm the live names in the submit form. Agensi allows up to 3.

**Tags:** agents, planning, diagrams, flight-plan, orchestration, sub-agents

**Use cases:** parallel sub-agent work, show the plan before it runs, human gate before a PR or send

**Compatibility note:** Works in Claude Code, Cursor, Copilot, Codex CLI, and other SKILL.md agents. Helper scripts need Python 3. No extra packages.

**Short description (summary, under 300 characters):**

Turns a multi-step request into an executable plan diagram you can review before anything runs. The JSON is both the picture and the contract. Trivial tasks stay small. Real work gets branches, a merge, and a human gate.

**Long description:**

You talk to the agent in chat. This skill makes it file a flight plan first.

The agent cuts the job into a small graph: sources, transforms, stores, decisions, loops, and a human gate. Labels are human names on a map. Instructions hold the technical guts. Parallel work is real branches that a person can later pause or kill, not a bullet list in a paragraph.

The honest-diagram rule is the whole point. The JSON the agent writes is the thing it is allowed to execute. It may not describe work that is not a node. Nothing starts until you approve the map. If the job is a one-step summarize or rewrite, you get a 1-3 node line, not a fake org chart.

A validator script checks the graph (kinds, DAG, gates, loops). A renderer prints a left-to-right Mermaid map. You can move the review gate before launch. Sending, opening a PR, or deploying has to wait on that gate.

This skill stops at the proposed plan. Steering a live run, the status board, and replay are separate listings.

**See it in action (paste into the listing):**

Request: "Research current auth, draft two login redesign approaches, and wait for me before changing any code."

Result: the agent wrote an interpretation paragraph, then a plan with two source branches (code-research and product-research), a merge, a decision, a drafting loop, a Your review gate, and a package node. It ran the validator (OK, 8 nodes, 2 research branches, 1 gate). It drew a left-to-right map and said, clearly, that nothing had run yet. It asked me to approve, to move the gate, or to reject. It did not touch application code in that turn. The plan JSON was saved so a later run could steer the same object. When I asked it to skip the gate and "just start coding," it refused and pointed at the gate node.

**Install (local):** copy `skills/delegated-work-flight-plan/` to `.cursor/skills/delegated-work-flight-plan/` (or the Claude/Codex path above). Ask: "File a flight plan before you start."

**Install (Agensi):** connect Agensi, then "Use Delegated Work Flight Plan on this request."

**ZIP for upload:** zip the `delegated-work-flight-plan` folder so SKILL.md sits inside it. Do not include `node_modules` or `.git`.

---

## 2. Steer a Running Agent Plan

**Slug:** `steer-running-plan`

**Listing title:** Steer a Running Agent Plan

**Suggested price:** $9 one-time

**Suggested categories:** Productivity, AI Agents, Developer Tools

**Tags:** agents, steering, pause, human-gate, interventions, orchestration

**Use cases:** kill a wasteful branch, edit loop instructions mid-run, approve or rewrite gated drafts, move the review gate before launch

**Compatibility note:** Same as the flight plan skill. Needs a live plan JSON. Python 3 optional for the apply helper.

**Short description:**

Steer a live plan from the diagram. Pause or kill one branch, edit a node's instructions, move the review gate, or approve, edit, and reject work sitting at a checkpoint. Every action is written on the same log as the agent's work.

**Long description:**

Once a plan is live, chat is a bad control panel. This skill treats the map as the controls.

You can pause a workstream and leave the others running, kill a branch (terminal, including downstream nodes that have no live inputs), or rewrite the instructions on a looping node so the next pass picks them up. Before approval you can slide the human gate earlier or later. While a gate is open, each item gets approved, edited, or rejected. Edits become preference notes for later drafts.

The agent is not allowed to grow the graph in secret. If evidence shows the current map would miss work, it emits a plan amendment with a title, a reason, a measured evidence line, and a mutation. No evidence, no amendment.

If the run is already finished or aborted, the skill refuses. It will not pretend a dead job is still steerable.

**See it in action:**

Request: "Kill product-research, and make the drafts lead with risk. Also reject the second approach at the gate."

Result: the agent loaded the live plan, checked that `product-research` was a real branch, recorded `kill_branch`, then recorded `edit_instructions` on the drafting loop with the new "lead with risk" text. When the gate opened it listed both drafts, marked approach B rejected, kept my edit on approach A, and attached a preference note for future loops. It did not restart the killed branch. The event log showed both interventions next to the agent's own events, which is what you want when someone asks later who stopped the branch.

**Install (local):** copy `skills/steer-running-plan/` to `.cursor/skills/steer-running-plan/`. Ask: "Pause the web-research branch" or "Move the review gate to after merge."

**Install (Agensi):** connect Agensi, then "Use Steer a Running Agent Plan."

**ZIP for upload:** zip the `steer-running-plan` folder.

---

## 3. Parallel Agent Mission Control

**Slug:** `parallel-agent-mission-control`

**Listing title:** Parallel Agent Mission Control

**Suggested price:** $12 one-time

**Suggested categories:** Productivity, AI Agents, DevOps

**Tags:** agents, status, mission-control, parallel, observability, dashboard

**Use cases:** several sub-agents in flight, counters instead of a spinner, crashed run that must not look live

**Compatibility note:** Reads a JSON event log. Python 3 optional for the status script.

**Short description:**

A status board for parallel agents. Fold the event log into per-branch status, ticking counters, and a short list of real plan changes. Operational noise stays on the node. A dead run is marked aborted, never left spinning.

**Long description:**

Mission control is a fold of the log, not a second story in chat.

Events come in two tiers. Structural ones change the graph or deserve a card (plan approved, amendment, pause, gate, finished). A healthy run has a handful of those. Operational ones only update a node: status, counters, a short output summary. Retries do not spawn new boxes.

The board groups nodes by branch, shows paused work, and calls out an open gate. If the process died mid-run, the skill closes it with an aborted event so the map cannot keep looking live. Downstream nodes whose inputs all died show killed, not pending forever.

Use this while work is in flight. Pair it with the flight plan skill at the start and the audit skill when you want to scrub history.

**See it in action:**

Request: "How are the login-research agents doing?"

Result: the agent folded the log and printed a board. Phase was executing. product-research was paused. code-research had Read current auth as done with files=12. A structural card explained a new SSO vendor-check node, with evidence that 3 of 12 auth files import the SSO client. It did not paste the raw file list. When I killed the terminal that was running the workers and asked again, it refused to keep a live spinner and closed the run as aborted, with a line that said how many steps had actually completed.

**Install (local):** copy `skills/parallel-agent-mission-control/` to `.cursor/skills/parallel-agent-mission-control/`. Ask: "Mission control status for this run."

**Install (Agensi):** connect Agensi, then "Use Parallel Agent Mission Control."

**ZIP for upload:** zip the `parallel-agent-mission-control` folder.

---

## 4. Agent Run Audit Trail

**Slug:** `agent-run-audit-trail`

**Listing title:** Agent Run Audit Trail

**Suggested price:** $9 one-time

**Suggested categories:** Productivity, AI Agents, Documentation

**Tags:** agents, audit, replay, timeline, event-log, postmortem

**Use cases:** why a branch appeared mid-run, export what actually ran, mark a crash aborted

**Compatibility note:** Needs the run's event JSON. Python 3 optional for the replay helper.

**Short description:**

Replay a run by folding a prefix of its event log. Scrub to the structural marks, see the map at that point, and export the raw trail. History is not rewritten. Aborted is not completed.

**Long description:**

If you kept the log, replay is free. The live board and the timeline are the same reducer. Jumping back in time means taking every event up to a sequence number and folding it.

Structural events are the ticks: proposed, approved, amended, gate, intervention, finished. Operational events fill the nodes between ticks. When someone asks why a new branch showed up, you replay to that amendment and read the evidence line. You do not invent a reason from chat.

Export is the raw JSON, named `audit-trail-<run-id>.json`. A summary can sit next to it. It cannot replace it. Failed and killed nodes stay in the file. If the worker crashed, you append one aborted finish event. You do not polish that into a success.

**See it in action:**

Request: "Why did an SSO branch show up? Export the trail."

Result: the agent ran a replay until the plan_amendment event. At seq 10 the map gained Check SSO vendor, with reason and evidence still attached. Nodes that had not started yet were still pending. It then wrote `audit-trail-run-1.json` with the original events, including the later aborted finish. It did not drop the pause on product-research to make the story neater. When I asked it to "just say it completed," it kept outcome=aborted.

**Install (local):** copy `skills/agent-run-audit-trail/` to `.cursor/skills/agent-run-audit-trail/`. Ask: "Replay this run to the amendment and export the audit trail."

**Install (Agensi):** connect Agensi, then "Use Agent Run Audit Trail."

**ZIP for upload:** zip the `agent-run-audit-trail` folder.

---

## Optional: list as a pack or bundle later

A **skill pack** is one ZIP that contains all four SKILL.md files. Buyers get every skill. Their agent picks by name and description. Only do this if you want one listing. Discovery is usually worse than four listings.

A **bundle** is only available after two or more paid listings are live. Agensi prices a bundle from $5, below the sum of the parts. Suggested bundle: $29 one-time for all four (sum of $12+$9+$12+$9 = $42).

Do not put outside checkout links (Gumroad, Stripe payment links, Ko-fi, and similar) in the listing. Agensi is the merchant of record.

---

## What only the owner can do on Agensi

This work does not create an Agensi account, submit a listing, or connect payouts. The owner still needs to:

1. Create an account at [agensi.io](https://www.agensi.io) and turn on Creator Mode (Dashboard, Settings). Creator Studio then appears.
2. Fill in the public profile (name, bio, avatar, link). The storefront is `agensi.io/creators/your-name`. The handle is 3 to 40 characters and can change once every 30 days.
3. For paid listings, connect a payout method in Creator Studio, Payouts. Stripe Connect in the EEA, UK, Switzerland, Gibraltar, US, and Canada. Zoneless (USDC on Solana) everywhere else. Paid skills will not submit without this. Free skills can go out with no payout setup.
4. Search the marketplace so each listing **name** is unique. Skill `name` values in SKILL.md must also be unique across Agensi. If a name is taken, change the folder, the frontmatter `name`, and the listing title together.
5. Make a square logo (512 x 512 recommended, up to 5 MB) and optional screenshots (up to 6, 10 MB each) plus a YouTube or Loom demo. This repo's `docs/screenshots/` are a starting point. Do not rely on images inside the ZIP. Agensi delivers text files to agents.
6. Zip each skill folder (50 MB max, 1,000 files). Upload at [agensi.io/dashboard/submit](https://www.agensi.io/dashboard/submit). Fill summary, description, "see it in action," compatibility, categories, tags, and permissions. The form can also read `summary`, `version`, `tags`, `keywords`, `use_cases`, and `docs_url` from SKILL.md.
7. Confirm detected permissions (files, tools, network). These skills read and write plan JSON and event logs in the working directory. Scripts do not use the network. There are no bundled dependencies.
8. Wait for the automated 8-point scan and a person. Most listings finish review in a few hours, up to 48 hours. You get email plus dashboard status.
9. After it is live: price edits go out immediately. A new ZIP is an update and goes through review while the current version keeps serving. Loading your own skill is free and does not count as a use.
10. Optional later: run a deal (at least 15% off, never under $5, up to 7 days), pin skills on the storefront, or group live paid listings into a bundle.

Sellers keep 70% of the net sale. Agensi's 30% covers payment fees. Agensi adds VAT where required. The 30-day money-back guarantee can reverse your share.

Docs used while packaging: [Package your skill](https://www.agensi.io/docs/packaging), [Submit on the website](https://www.agensi.io/docs/submit-on-the-website), [What you can sell](https://www.agensi.io/docs/what-you-can-sell), [Pricing](https://www.agensi.io/docs/pricing-your-skill), [Earnings and payouts](https://www.agensi.io/docs/earnings-and-payouts), [Creator quickstart](https://www.agensi.io/docs/creator-quickstart).
