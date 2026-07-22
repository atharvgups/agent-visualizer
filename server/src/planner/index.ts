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
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("planner response contained no JSON object");
  }
  const jsonText = text.slice(start, end + 1);
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
  if (!res.ok) throw new Error(`anthropic api ${res.status}: ${await readErrorBody(res)}`);
  const data = (await res.json()) as { content: { type: string; text?: string }[] };
  const text = data.content.find((c) => c.type === "text")?.text ?? "";
  if (!text.trim()) throw new Error("anthropic api returned empty text");
  return text;
}

async function geminiComplete(prompt: string, apiKey: string): Promise<string> {
  const model = process.env.PLANNER_MODEL ?? "gemini-2.5-flash";
  // Gemini 2.5+ thinks by default; thinking tokens count against
  // maxOutputTokens and can leave the candidate empty. Disable thinking for
  // reliable structured plan JSON (domain planner is the quality fallback).
  const thinkingBudget = Number(process.env.GEMINI_THINKING_BUDGET ?? "0");
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
          thinkingConfig: { thinkingBudget: Number.isFinite(thinkingBudget) ? thinkingBudget : 0 },
        },
      }),
    }
  );
  if (!res.ok) throw new Error(`gemini api ${res.status}: ${await readErrorBody(res)}`);
  const data = (await res.json()) as {
    candidates?: {
      finishReason?: string;
      content?: { parts?: { text?: string; thought?: boolean }[] };
    }[];
    promptFeedback?: { blockReason?: string };
  };
  if (data.promptFeedback?.blockReason) {
    throw new Error(`gemini blocked prompt (${data.promptFeedback.blockReason})`);
  }
  const candidate = data.candidates?.[0];
  if (!candidate) throw new Error("gemini api returned no candidates");
  const text =
    candidate.content?.parts
      ?.filter((p) => !p.thought)
      .map((p) => p.text ?? "")
      .join("") ?? "";
  if (!text.trim()) {
    throw new Error(
      `gemini api returned empty text (finishReason=${candidate.finishReason ?? "unknown"})`
    );
  }
  return text;
}

async function readErrorBody(res: Response): Promise<string> {
  try {
    const body = await res.text();
    return body.slice(0, 240).replace(/\s+/g, " ");
  } catch {
    return "(unreadable body)";
  }
}
