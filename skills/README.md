# Agent skills for listing on Agensi

These four skills package the workflows behind agent-visualizer so other agents (Cursor, Claude Code, GitHub Copilot, and anything else that loads [Agent Skills](https://agentskills.io)) can run them without installing this app.

They follow the open `SKILL.md` format Agensi accepts: YAML frontmatter with `name` and `description`, then instructions, plus optional scripts and reference files. Agensi also reads `summary`, `version`, `tags`, `keywords`, and `use_cases` from the frontmatter when you upload.

Do not publish from this PR. Listing, pricing, and payouts have to be done by the repo owner in the Agensi dashboard. See **Owner-only steps** at the bottom.

You can list each skill on its own (one ZIP per folder) or zip this whole `skills/` directory as a skill pack. A pack is one listing whose buyer gets every included skill.

## Honest Plan Diagram

- **Folder:** `skills/honest-plan-diagram/`
- **Listing title:** Honest Plan Diagram
- **Suggested price:** $12 one-time (Agensi minimum for card checkout is $5; under $5 is credit-only)
- **Tags:** planning, multi-agent, diagrams, subagents, mermaid, human-in-the-loop, proposed-plan
- **Suggested Agensi categories:** pick up to three on the form. First one is the category page. Closest fits are developer tooling, agent workflows, and productivity if those names exist in the list of 32.

**Short description (summary, max 300 characters):**

Turn a prompt into a reviewable agent plan diagram before any subagent starts. The graph is the contract the agent will actually run, not a caption of work happening somewhere else.

**Long description (listing body):**

Most agents start working the moment you hit send. You get a spinner, then a surprise. This skill makes the agent draw the plan first.

It maps the job onto a small, fixed vocabulary: source, transform, store, decision, human gate, and loop. Labels stay human ("Find events on the web"), and the technical guts live in per-node instructions. Parallel work is grouped into branches you can later pause or kill. Anything that would email, post, or submit has to pass a human gate.

Trivial requests stay small. "Summarize this" does not become a ten-node orchestra.

What you get in the chat:

1. A one-paragraph interpretation of the goal
2. A Mermaid map of the proposed graph
3. A chance to move the review gate before launch
4. A hard stop until you approve

A bundled checker validates the JSON (unique ids, real edges, no cycles, gates are actually gates) and prints the diagram. Nothing in the skill talks to a paid API. It runs inside whatever agent already has.

Where it stops: it does not execute the plan, spawn your company's workers, or replace a full product UI. After you approve, execution is on you (or on the companion skills in this folder).

**See it in action (paste into Agensi's demo field):**

You: "Find ChinaJoy side events worth applying to, then draft applications I can review."

Agent: proposes a map with web research, social research, a merge, a prioritize step, a draft loop, and a "Your review" gate before packaging. Interpretation says nothing goes out until you say so. Validator prints `ok: 9 nodes, 1 approval gate(s), DAG` plus a flowchart. Agent asks whether to move the gate earlier, then waits. No search queries have run yet.

## Steer a Running Plan

- **Folder:** `skills/steer-running-plan/`
- **Listing title:** Steer a Running Plan
- **Suggested price:** $15 one-time
- **Tags:** orchestration, interventions, pause, kill, human-gate, multi-agent, edit-instructions
- **Suggested Agensi categories:** agent workflows, developer tooling, productivity

**Short description:**

Pause, kill, or rewrite a branch of a live agent plan without stopping the rest of the work. Review gates can move before launch. Drafts at a gate can be approved, edited, or rejected.

**Long description:**

Once a plan is in motion, most agents only understand "stop" or "keep going." This skill gives the human six precise hands on the same map.

- Approve the proposed plan (launch)
- Move a review gate, but only before launch
- Pause a named branch; other branches keep working
- Resume it
- Kill a branch, and anything that only depended on it dies instead of hanging
- Edit the instructions on one node without rebuilding the graph

Running workers have to checkpoint. A paused branch does not keep calling tools. A killed branch does not smuggle half-finished notes into the merge as if they were verified.

Human gates stay blocked until every item is approved, edited, or rejected. Edits become a preference note the later nodes can see. The skill will not auto-approve because the drafts "look fine."

Every action is written onto the same event log the agent uses, so the audit trail shows that you stepped in. A bundled script applies gate moves and instruction edits mechanically so the graph stays a DAG.

Where it stops: it does not invent a plan, and it will not steer a run that is already finished. Dead runs return a conflict, not a fake live map.

**See it in action:**

You: "Kill the web-research branch, it is dumping conference spam. Leave social-research running. And rewrite verify to drop anything without a public registration page."

Agent: names `kill_branch` on `web-research` and `edit_instructions` on the verify node as two separate interventions. Merge no longer waits on the dead web inputs. Social-research keeps scanning. The instruction change is quoted back. Both actions are logged as structural events.

## Mission Control for Parallel Agents

- **Folder:** `skills/mission-control-status/`
- **Listing title:** Mission Control for Parallel Agents
- **Suggested price:** $12 one-time
- **Tags:** monitoring, parallel-agents, status, observability, event-log, live-run
- **Suggested Agensi categories:** agent workflows, developer tooling, observability (or the closest names on the form)

**Short description:**

A live status board for parallel agent workstreams. Structural changes get cards. Counters tick inside existing nodes. A crashed run is marked aborted instead of looking alive.

**Long description:**

Parallel agents disappear into chat. This skill keeps one board folded from an append-only event log.

Events come in two tiers. Structural ones (plan proposed, approved, amended, gated, intervened, finished) are rare, about 5 to 15 per run, and each becomes an annotation card. Operational ones (status, counters, output summaries) update the node you already have. Retries do not spawn new boxes.

The board always shows:

- Phase and whether a worker is actually live
- The same map as the plan, with status and counters
- Branches grouped so you can see what is moving, paused, or dead
- Newest-first cards for the changes that matter
- Any open human gate

If the process dies, the next look at the board closes the run with an aborted marker. Interventions against a non-live run are refused.

A bundled reducer turns `events.jsonl` into that board, and `--seq N` scrubs the timeline. Live view and replay are the same fold. That is the whole trick.

Where it stops: it is not a hosted dashboard and it does not open a browser. It is the discipline and the status text your agent should already be showing you.

**See it in action:**

You: "What is happening on the ChinaJoy run?"

Agent: `executing · live`. Web-research is done (found 42). Verify is running (reviewed 20, verified 6). Social-research is paused because you paused it. One card: "Branch paused: social-research." No paragraph per retry. Map matches the original plan.

## Plan Amendment Audit

- **Folder:** `skills/plan-amendment-audit/`
- **Listing title:** Plan Amendment Audit
- **Suggested price:** $9 one-time
- **Tags:** audit, amendments, replay, event-log, evidence, honest-diagram
- **Suggested Agensi categories:** agent workflows, compliance, developer tooling

**Short description:**

When a running plan has to change, record the mutation, the reason, and the evidence. Afterward, scrub the log and see how the proposed map became what actually ran.

**Long description:**

Agents adapt in their heads and the picture you were shown goes stale. This skill forbids that.

If execution needs a node the graph does not contain, the agent emits a `plan_amendment` with four things: a short title, a reason the current graph is wrong, evidence from actual worker output, and a mutation (add/remove nodes and edges). No evidence, no amendment. "I thought it might help" is not evidence. "40% of 10 verified events came from Chinese-language sources" is.

New work uses the same node vocabulary as the original plan and should wire into an existing merge point instead of floating off to the side. The checker re-validates the DAG before the change is accepted.

When the run ends, the same JSONL log is the audit trail. You can export it, fold it up to any sequence number, and draw the map at that moment. Human interventions and agent amendments share the bus, so nobody can hide a kill or a pivot.

Where it stops: it will not hide a change because you asked nicely, and it will not rewrite old events. Append only. Crashed runs close as aborted.

**See it in action:**

Mid-run, verify finishes and 4 of 10 kept events are Chinese-language. The agent adds a "Chinese social deep-dive" source, wires it into merge, and posts a card with the 40% figure as evidence. Later you run `replay_audit.py events.jsonl --until 10` and see the map just before that branch existed. `--export-markdown` prints the full trail.

## Pack option

If you would rather sell one product:

- **Listing title:** Mission Control Skill Pack
- **Suggested price:** $29 one-time (stay under the sum of the four, Agensi's bundle rule is similar once they are live as separate listings)
- **ZIP layout:** this `skills/` folder as-is. Agensi treats two or more `SKILL.md` files as a pack. The first heading in this README can serve as the pack name if you include it in the ZIP.

Bundles (a discount across already-live listings) can only be created after each skill is live. That is an owner dashboard step.

## Install instructions (buyers)

### On Agensi, after a listing is live

1. Connect the Agensi MCP to your agent (`mcp.agensi.io`, or the "Connect your agent" flow on agensi.io).
2. Sign in when the connector asks.
3. Say the skill name, or describe the job and let the agent pick it.
4. Free skills run for anyone with a connected agent. Paid skills ask before spending.

Agensi delivers the `SKILL.md` and supporting text files into the session. It does not install a desktop plugin, a Cursor hook, or this repo's Node server. Scripts are meant to be run as shipped, not rewritten.

### Local install (this repo, or a ZIP you hand someone)

Copy one folder, keep the name:

- **Cursor:** `your-project/.cursor/skills/<slug>/` or `~/.cursor/skills/<slug>/`
- **Claude Code:** `your-project/.claude/skills/<slug>/` or `~/.claude/skills/<slug>/`
- **GitHub Copilot:** `your-project/.github/skills/<slug>/` when that product is looking for Agent Skills

Each folder must contain `SKILL.md`. Scripts need Python 3 (stdlib only). From inside a skill folder:

```bash
python3 scripts/validate_plan.py references/example-plan.json
python3 scripts/apply_intervention.py --plan ../honest-plan-diagram/references/example-plan.json --action pause_branch --branch web-research
python3 scripts/reduce_events.py ../plan-amendment-audit/references/sample-events.jsonl
python3 scripts/replay_audit.py ../plan-amendment-audit/references/sample-events.jsonl --check-amendments --export-markdown
```

(Run each script from its own skill's directory.)

### What this is not

These skills teach an agent the workflow. They do not deploy agent-visualizer, bind a port, or require `ANTHROPIC_API_KEY`. If you want the live React map from this repo, that is still `pnpm dev` in the app, not an Agensi install.

## Package for upload

One skill:

```bash
cd skills
zip -r honest-plan-diagram.zip honest-plan-diagram
```

Pack of all four:

```bash
cd skills
zip -r mission-control-pack.zip README.md honest-plan-diagram steer-running-plan mission-control-status plan-amendment-audit
```

Limits from Agensi's packaging docs (as of the public docs): website ZIP up to 50 MB, no `node_modules`, no executables, keep each script's logic small (they suggest under 20 KB). Scripts cannot read sibling files at runtime when Agensi runs them from a temp path, which is why each script is self-contained. Do not put secrets in the ZIP. Names must be unique across Agensi.

## Owner-only steps (cannot be done in this PR)

1. Create an agensi.io account and turn on Creator Mode (Dashboard → Settings). Fill in name, bio, avatar, storefront slug.
2. For paid listings, connect payouts in Creator Studio → Payouts (Stripe Connect in supported countries, otherwise Zoneless / USDC). KYC is required to receive money. Paid skills will not go live without a payout method. You keep 70% of each sale.
3. Confirm each listing `name` is unused on Agensi (names are unique).
4. Upload each ZIP at [agensi.io/dashboard/submit](https://www.agensi.io/dashboard/submit). Add a square logo (512×512), paste the short/long copy from this file, set price, pick up to 3 categories, confirm detected permissions, optionally add screenshots from `docs/screenshots/` and a Loom or YouTube demo.
5. Wait for the automated scan plus human review (publicly described as usually within 24 to 48 hours).
6. Optional later: deals, bundles of live paid listings, pinning skills on your storefront.

Do not add Gumroad, Stripe payment links, or other off-platform checkouts to the listing. Agensi rejects those.

Public docs used while packaging: [Package your skill](https://www.agensi.io/docs/packaging), [Submit on the website](https://www.agensi.io/docs/submit-on-the-website), [What you can sell](https://www.agensi.io/docs/what-you-can-sell), [Pricing](https://www.agensi.io/docs/pricing-your-skill), [Earnings and payouts](https://www.agensi.io/docs/earnings-and-payouts), [Creator quickstart](https://www.agensi.io/docs/creator-quickstart).
