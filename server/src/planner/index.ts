import { Plan, validatePlanGraph } from "@agent-viz/shared";
import { PLANNER_SYSTEM_PROMPT } from "./plannerPrompt";
import { buildPlan } from "./domainPlanner";

/**
 * Planner entry point. Uses an LLM when an API key is configured
 * (ANTHROPIC_API_KEY, or GEMINI_API_KEY for Google's free tier); otherwise —
 * and on any invalid LLM output — uses the deterministic domain planner so
 * the plan-as-data contract always holds.
 */
export async function generatePlan(id: string, prompt: string): Promise<Plan> {
  const provider = pickProvider();
  if (provider) {
    try {
      const raw = await provider.complete(prompt);
      const plan = parsePlanJson(id, prompt, raw);
      const errors = validatePlanGraph(plan);
      if (errors.length === 0) return plan;
      console.warn(
        `${provider.name} plan invalid (${errors.join("; ")}); falling back to domain planner`
      );
    } catch (err) {
      console.warn(
        `${provider.name} planner failed (${(err as Error).message}); falling back to domain planner`
      );
    }
  }
  return buildPlan(id, prompt);
}

interface Provider {
  name: string;
  complete: (prompt: string) => Promise<string>;
}

function pickProvider(): Provider | null {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    return { name: "anthropic", complete: (p) => anthropicComplete(p, anthropicKey) };
  }
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    return { name: "gemini", complete: (p) => geminiComplete(p, geminiKey) };
  }
  return null;
}

function parsePlanJson(id: string, prompt: string, text: string): Plan {
  const jsonText = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  const parsed = JSON.parse(jsonText) as Omit<Plan, "id" | "prompt">;
  return Plan.parse({ ...parsed, id, prompt });
}

async function anthropicComplete(prompt: string, apiKey: string): Promise<string> {
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
  return data.content.find((c) => c.type === "text")?.text ?? "";
}

async function geminiComplete(prompt: string, apiKey: string): Promise<string> {
  const model = process.env.PLANNER_MODEL ?? "gemini-2.5-flash";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: PLANNER_SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: 8192,
        },
      }),
    }
  );
  if (!res.ok) throw new Error(`gemini api ${res.status}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
}
