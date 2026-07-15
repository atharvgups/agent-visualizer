import { Plan, PlanEdge, PlanNode, validatePlanGraph } from "@agent-viz/shared";

/**
 * Deterministic planner for the MVP's hardcoded domain:
 * event/opportunity research -> verification -> application drafting.
 * Used when no LLM key is configured, and as the fallback when the LLM
 * planner returns an invalid graph. Being rule-based keeps it honest: the
 * graph it emits is exactly the graph the orchestrator executes.
 */

const TRIVIAL_PATTERNS = /^(summari[sz]e|translate|rewrite|explain|define|convert)\b/i;

export function extractTopic(prompt: string): string {
  const quoted = prompt.match(/["“]([^"”]+)["”]/);
  if (quoted) return quoted[1];
  // capitalized phrases, ignoring a capitalized sentence-leading verb
  const matches = [...prompt.matchAll(/\b([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)*)\b/g)];
  const nonLeading = matches.find((m) => m.index !== undefined && m.index > 0);
  return nonLeading?.[1] ?? matches[0]?.[1] ?? "the target";
}

/** Complexity gate (§3c): trivial single-agent tasks skip the full map. */
export function isTrivialTask(prompt: string): boolean {
  const words = prompt.trim().split(/\s+/);
  return TRIVIAL_PATTERNS.test(prompt.trim()) || words.length < 5;
}

function trivialPlan(id: string, prompt: string): Plan {
  const nodes: PlanNode[] = [
    {
      id: "do-task",
      kind: "transform",
      label: "Do the task",
      summary: "Single-step task; no multi-agent system needed.",
      instructions: prompt,
      agent: "solo",
      branch: "solo",
    },
    {
      id: "deliver",
      kind: "store",
      label: "Deliver result",
      summary: "Hand the finished result back.",
      instructions: "Return the output of the task to the user.",
      agent: "solo",
      branch: "solo",
    },
  ];
  const edges: PlanEdge[] = [{ id: "e1", source: "do-task", target: "deliver" }];
  return {
    id,
    prompt,
    interpretation: `This looks like a single-step task, so I'll skip the full system map: ${prompt}`,
    nodes,
    edges,
    approvalGates: [],
    loops: [],
  };
}

export function buildPlan(id: string, prompt: string): Plan {
  if (isTrivialTask(prompt)) return trivialPlan(id, prompt);

  const topic = extractTopic(prompt);
  const nodes: PlanNode[] = [
    {
      id: "web-search",
      kind: "source",
      label: "Find events on the web",
      summary: `Search the open web for ${topic} side events, satellite gatherings and adjacent meetups.`,
      instructions: `Run broad and narrow web queries for events around ${topic}. Collect candidate events with name, date, organizer and link.`,
      agent: "web-research",
      branch: "web-research",
    },
    {
      id: "web-verify",
      kind: "transform",
      label: "Verify relevance",
      summary: "Check each candidate is real, current and actually related.",
      instructions: "Cross-check dates, organizers and venues. Drop duplicates, stale listings and unrelated events.",
      agent: "web-research",
      branch: "web-research",
    },
    {
      id: "social-search",
      kind: "source",
      label: "Scan social chatter",
      summary: `Watch social platforms for ${topic} event announcements that never hit event sites.`,
      instructions: `Search social platforms for ${topic} side-event announcements, host callouts and RSVP links.`,
      agent: "social-research",
      branch: "social-research",
    },
    {
      id: "social-verify",
      kind: "transform",
      label: "Confirm social finds",
      summary: "Separate real announcements from noise and hype.",
      instructions: "Verify each social find against an organizer account or registration page before keeping it.",
      agent: "social-research",
      branch: "social-research",
    },
    {
      id: "platform-sweep",
      kind: "source",
      label: "Sweep event platforms",
      summary: "Check dedicated event platforms for listed side events.",
      instructions: `Enumerate ${topic}-tagged listings on event platforms; capture application requirements and deadlines.`,
      agent: "event-platforms",
      branch: "event-platforms",
    },
    {
      id: "merge-events",
      kind: "store",
      label: "Merge verified events",
      summary: "Combine all verified events into one deduplicated list.",
      instructions: "Merge branch outputs, dedupe by name+date, keep the best source per event.",
      agent: "synthesis",
      branch: "synthesis",
    },
    {
      id: "prioritize",
      kind: "decision",
      label: "Prioritize opportunities",
      summary: "Rank events by fit, reach and application effort.",
      instructions: "Score each event on audience fit, strategic value and effort. Select the top items for drafting.",
      agent: "synthesis",
      branch: "synthesis",
    },
    {
      id: "draft-applications",
      kind: "loop",
      label: "Draft applications",
      summary: "Write a tailored application for each priority event.",
      instructions: "For each selected event, draft an application with positioning tailored to that event's audience.",
      agent: "drafting",
      branch: "drafting",
    },
    {
      id: "review-gate",
      kind: "human_gate",
      label: "Your review",
      summary: "Nothing is submitted until you approve the drafts.",
      instructions: "Present drafts for approval; capture edits as preference notes for future drafting.",
      agent: "drafting",
      branch: "drafting",
    },
    {
      id: "package",
      kind: "store",
      label: "Package approved applications",
      summary: "Assemble approved applications, ready to submit.",
      instructions: "Collect approved drafts with event metadata and deadlines into a final package.",
      agent: "drafting",
      branch: "drafting",
    },
  ];

  const edges: PlanEdge[] = [
    { id: "e-web", source: "web-search", target: "web-verify" },
    { id: "e-social", source: "social-search", target: "social-verify" },
    { id: "e-web-merge", source: "web-verify", target: "merge-events" },
    { id: "e-social-merge", source: "social-verify", target: "merge-events" },
    { id: "e-platform-merge", source: "platform-sweep", target: "merge-events" },
    { id: "e-merge-prio", source: "merge-events", target: "prioritize" },
    { id: "e-prio-draft", source: "prioritize", target: "draft-applications", label: "top picks" },
    { id: "e-draft-gate", source: "draft-applications", target: "review-gate" },
    { id: "e-gate-package", source: "review-gate", target: "package", label: "approved" },
  ];

  const plan: Plan = {
    id,
    prompt,
    interpretation:
      `You want a complete picture of ${topic} side events and ready-to-send applications for the ones worth attending. ` +
      `I'll run three research branches in parallel (web, social, event platforms), verify everything, merge and rank the results, ` +
      `then draft applications — and stop for your review before anything is finalized.`,
    nodes,
    edges,
    approvalGates: ["review-gate"],
    loops: [{ nodeId: "draft-applications", until: "every priority event has a draft", maxIterations: 3 }],
  };

  const errors = validatePlanGraph(plan);
  if (errors.length > 0) throw new Error(`domain planner produced invalid plan: ${errors.join("; ")}`);
  return plan;
}
