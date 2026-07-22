import { afterEach, describe, expect, it, vi } from "vitest";

const validPlanJson = JSON.stringify({
  interpretation: "Research a conference and draft an application.",
  nodes: [
    {
      id: "search",
      kind: "source",
      label: "Find events",
      summary: "Search the web",
      instructions: "Search for events",
      agent: "web-research",
      branch: "research",
    },
    {
      id: "draft",
      kind: "transform",
      label: "Draft application",
      summary: "Write a draft",
      instructions: "Draft from findings",
      agent: "writer",
      branch: "drafting",
    },
    {
      id: "review",
      kind: "human_gate",
      label: "Review draft",
      summary: "Human reviews",
      instructions: "Wait for approval",
      agent: "human",
      branch: "drafting",
    },
  ],
  edges: [
    { id: "e1", source: "search", target: "draft" },
    { id: "e2", source: "draft", target: "review" },
  ],
  approvalGates: ["review"],
  loops: [],
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.PLANNER_MODEL;
  delete process.env.GEMINI_THINKING_BUDGET;
  vi.resetModules();
});

describe("generatePlan providers", () => {
  it("uses the deterministic planner when no API key is set", async () => {
    const { generatePlan } = await import("./index");
    const plan = await generatePlan("run-1", "Find ChinaJoy side events and draft an application");
    expect(plan.id).toBe("run-1");
    expect(plan.nodes.length).toBeGreaterThan(0);
  });

  it("calls Gemini when GEMINI_API_KEY is set and returns a valid plan", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ finishReason: "STOP", content: { parts: [{ text: validPlanJson }] } }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { generatePlan } = await import("./index");
    const plan = await generatePlan("run-gemini", "Plan a research run");

    expect(plan.id).toBe("run-gemini");
    expect(plan.nodes.map((n) => n.id)).toEqual(["search", "draft", "review"]);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/models/gemini-2.5-flash:generateContent");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-gemini-key");
    const body = JSON.parse(String(init.body)) as {
      generationConfig: { thinkingConfig: { thinkingBudget: number }; responseMimeType: string };
    };
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.thinkingConfig.thinkingBudget).toBe(0);
  });

  it("falls back when Gemini returns empty candidates", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [] } }] }),
      })
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { generatePlan } = await import("./index");
    const plan = await generatePlan("run-empty", "Find ChinaJoy side events");

    expect(plan.id).toBe("run-empty");
    expect(plan.nodes.length).toBeGreaterThan(0);
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/empty text/);
  });

  it("prefers Anthropic when both keys are set", async () => {
    process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
    process.env.GEMINI_API_KEY = "test-gemini-key";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: validPlanJson }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { generatePlan } = await import("./index");
    await generatePlan("run-both", "Plan something");

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("api.anthropic.com");
  });
});
