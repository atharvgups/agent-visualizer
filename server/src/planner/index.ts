import { Plan, validatePlanGraph } from "@agent-viz/shared";
import { PLANNER_SYSTEM_PROMPT } from "./plannerPrompt";
import { buildPlan } from "./domainPlanner";

/**
 * Planner entry point. Uses an LLM when ANTHROPIC_API_KEY is configured;
 * otherwise (and on any invalid LLM output) uses the deterministic domain
 * planner so the plan-as-data contract always holds.
 */
export async function generatePlan(id: string, prompt: string): Promise<Plan> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    try {
      const plan = await llmPlan(id, prompt, apiKey);
      const errors = validatePlanGraph(plan);
      if (errors.length === 0) return plan;
      console.warn(`LLM plan invalid (${errors.join("; ")}); falling back to domain planner`);
    } catch (err) {
      console.warn(`LLM planner failed (${(err as Error).message}); falling back to domain planner`);
    }
  }
  return buildPlan(id, prompt);
}

async function llmPlan(id: string, prompt: string, apiKey: string): Promise<Plan> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.PLANNER_MODEL ?? "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: PLANNER_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic api ${res.status}`);
  const data = (await res.json()) as { content: { type: string; text?: string }[] };
  const text = data.content.find((c) => c.type === "text")?.text ?? "";
  const jsonText = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  const parsed = JSON.parse(jsonText) as Omit<Plan, "id" | "prompt">;
  return Plan.parse({ ...parsed, id, prompt });
}
