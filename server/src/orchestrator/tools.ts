/**
 * Simple simulated tools for the MVP orchestrator (build step 3 of the
 * pressure test: "orchestrator that executes the JSON with fake/simple tools").
 * The orchestrator's decisions (amendments, gating, branch handling) are real
 * logic operating on this tool output.
 */

export interface CandidateEvent {
  name: string;
  date: string;
  organizer: string;
  language: "en" | "zh";
  verified: boolean;
  source: string;
}

export interface DraftApplication {
  id: string;
  title: string;
  content: string;
}

/** Deterministic PRNG so runs are reproducible for a given seed. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EVENT_KINDS = [
  "Indie Showcase",
  "Developer Mixer",
  "Publisher Night",
  "Cosplay Gala",
  "Esports Watch Party",
  "Investor Breakfast",
  "Hardware Demo Day",
  "Community Meetup",
  "Press Preview",
  "After Party",
];

const EN_ORGANIZERS = ["GameHive", "PixelWorks", "NextPlay Labs", "Meridian Games", "Startup Grind"];
const ZH_ORGANIZERS = ["米哈游社区", "腾讯游戏学堂", "B站游戏区", "小红书游联", "网易游戏茶馆"];

/** True when the topic plausibly has a Chinese-language event ecosystem. */
export function topicHasChineseEcosystem(topic: string): boolean {
  return /china|chinajoy|shanghai|beijing|shenzhen|hangzhou|wechat|weibo|bilibili/i.test(topic);
}

export function searchEvents(opts: {
  rng: () => number;
  topic: string;
  channel: "web" | "social" | "platform";
  count: number;
}): CandidateEvent[] {
  const { rng, topic, channel, count } = opts;
  const zhBias = topicHasChineseEcosystem(topic) ? (channel === "social" ? 0.45 : 0.3) : 0.05;
  const out: CandidateEvent[] = [];
  for (let i = 0; i < count; i++) {
    const zh = rng() < zhBias;
    const organizers = zh ? ZH_ORGANIZERS : EN_ORGANIZERS;
    out.push({
      name: `${topic} ${EVENT_KINDS[Math.floor(rng() * EVENT_KINDS.length)]} #${i + 1}`,
      date: `2026-07-${String(24 + Math.floor(rng() * 5)).padStart(2, "0")}`,
      organizer: organizers[Math.floor(rng() * organizers.length)],
      language: zh ? "zh" : "en",
      verified: rng() < (zh ? 0.35 : 0.25),
      source: channel,
    });
  }
  return out;
}

export function draftApplication(opts: {
  event: CandidateEvent;
  index: number;
  instructions: string;
}): DraftApplication {
  const { event, index, instructions } = opts;
  return {
    id: `draft-${index}`,
    title: `Application: ${event.name}`,
    content:
      `To: ${event.organizer}\n` +
      `Event: ${event.name} (${event.date})\n\n` +
      `We'd love to take part in ${event.name}. Our team builds tools for making AI agent work ` +
      `visible and steerable, which fits your audience of builders and operators.\n\n` +
      `Positioning notes (from plan instructions): ${instructions.slice(0, 140)}`,
  };
}
