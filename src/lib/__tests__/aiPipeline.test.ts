import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { aiRecommend } from "@/lib/ai/pipeline";
import { generateWithRetry, LlmOutputError, type GenerateOptions, type LlmClient, type Usage } from "@/lib/ai/llm";
import { costEur } from "@/lib/ai/cost";
import { loadPrompt, renderPrompt } from "@/lib/ai/prompts";
import { ConceptsSchema, RerankSchema } from "@/lib/ai/schemas";
import { buildProfile } from "@/lib/intake";
import { CatalogProvider } from "@/lib/providers/CatalogProvider";
import { sampleIntake } from "./fixtures";

const today = new Date("2026-12-01T09:00:00Z");
const catalog = new CatalogProvider();
const settings = { conceptModel: "claude-haiku-5-5", rerankModel: "claude-sonnet-5-5" };

const concepts = {
  concepts: [
    { title: "Padel gear", category: "sports-fitness", whyItFits: "plays padel", priceMinEur: 20, priceMaxEur: 60, searchKeywords: ["padel"] },
    { title: "Manual coffee", category: "coffee-tea", whyItFits: "black coffee", priceMinEur: 20, priceMaxEur: 60, searchKeywords: ["coffee", "manual brewing"] },
    { title: "Outdoor", category: "outdoor-travel", whyItFits: "active", priceMinEur: 20, priceMaxEur: 60, searchKeywords: ["hiking"] },
  ],
};

/** Fake LLM: answers each schema with a canned reply, or a function of the prompt. */
class FakeLlm implements LlmClient {
  calls: string[] = [];
  constructor(private readonly rerank: (prompt: string) => unknown, private failFirst = 0) {}
  async generate<S extends z.ZodType>(opts: GenerateOptions<S>) {
    this.calls.push(opts.model);
    if (this.failFirst > 0) {
      this.failFirst--;
      throw new LlmOutputError("bad output");
    }
    const raw = opts.schema === (ConceptsSchema as z.ZodType) ? concepts : this.rerank(opts.prompt);
    const usage: Usage = { model: opts.model, inputTokens: 1000, outputTokens: 500 };
    return { data: opts.schema.parse(raw) as z.infer<S>, usage };
  }
}

function idsInPrompt(prompt: string): string[] {
  return [...prompt.matchAll(/^(catalog-[a-z0-9-]+) \|/gm)].map((m) => m[1]);
}

describe("aiRecommend", () => {
  const profile = buildProfile(sampleIntake);

  it("drops products the model invented and keeps only real candidates", async () => {
    const llm = new FakeLlm((prompt) => ({
      picks: [
        { productId: "made-up-product", fitScore: 99, reason: "invented" },
        ...idsInPrompt(prompt).slice(0, 3).map((id) => ({ productId: id, fitScore: 80, reason: `Because padel (${id})` })),
      ],
      wildcard: { productId: "also-made-up", reason: "nope" },
    }));
    const r = await aiRecommend(profile, catalog, llm, settings, undefined, today);
    const ids = new Set(catalog.all().map((p) => p.id));
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.items.length).toBeLessThanOrEqual(3);
    for (const rec of [...r.items, ...(r.wildcard ? [r.wildcard] : [])]) expect(ids.has(rec.product.id)).toBe(true);
    expect(r.items.map((i) => i.product.id)).not.toContain("made-up-product");
    expect(r.items[0].reason).toMatch(/^Because padel/);
  });

  it("enforces budget and max 2 per category even if the model ignores it", async () => {
    const llm = new FakeLlm((prompt) => ({
      picks: idsInPrompt(prompt).map((id, i) => ({ productId: id, fitScore: 100 - i, reason: "fits" })),
      wildcard: null,
    }));
    const r = await aiRecommend(profile, catalog, llm, settings, undefined, today);
    const perCat = new Map<string, number>();
    for (const rec of r.items) {
      expect(rec.product.priceEur).toBeLessThanOrEqual(60);
      perCat.set(rec.product.category, (perCat.get(rec.product.category) ?? 0) + 1);
    }
    expect(Math.max(...perCat.values())).toBeLessThanOrEqual(2);
    expect(r.items.length).toBeLessThanOrEqual(10);
  });

  it("uses the cheap model for concepts and the strong model for reranking, and logs usage", async () => {
    const llm = new FakeLlm(() => ({ picks: [], wildcard: null }));
    const r = await aiRecommend(profile, catalog, llm, settings, undefined, today);
    expect(llm.calls).toEqual(["claude-haiku-5-5", "claude-sonnet-5-5"]);
    expect(r.usage).toHaveLength(2);
    expect(r.promptVersion).toBe("concepts.v2+rerank.v2");
  });

  it("never sends rejected or out-of-budget products to the model", async () => {
    let seen: string[] = [];
    const llm = new FakeLlm((prompt) => {
      seen = idsInPrompt(prompt);
      return { picks: [], wildcard: null };
    });
    const first = (await catalog.search({ keywords: ["padel"] }))[0];
    await aiRecommend(profile, catalog, llm, settings, { liked: [], disliked: [first.id] }, today);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen).not.toContain(first.id);
    for (const id of seen) expect((await catalog.getById(id))!.priceEur).toBeLessThanOrEqual(60);
  });
});

describe("generateWithRetry", () => {
  const opts = { model: "m", prompt: "p", schema: RerankSchema };
  const ok = () => ({ picks: [], wildcard: null });

  it("retries once and then succeeds", async () => {
    const usage: Usage[] = [];
    const llm = new FakeLlm(ok, 1);
    await expect(generateWithRetry(llm, opts, usage)).resolves.toEqual(ok());
    expect(llm.calls).toHaveLength(2);
  });

  it("gives up after the second failure", async () => {
    const llm = new FakeLlm(ok, 2);
    await expect(generateWithRetry(llm, opts, [])).rejects.toThrow("bad output");
    expect(llm.calls).toHaveLength(2);
  });
});

describe("prompts", () => {
  it("are versioned files with all placeholders filled", () => {
    const t = loadPrompt("rerank.v2");
    expect(t).toContain("{{products}}");
    expect(() => renderPrompt(t, {})).toThrow(/Missing prompt variable/);
    expect(() => loadPrompt("../package")).toThrow();
  });
});

describe("costEur", () => {
  it("stays under the €0.02 target for a typical request", () => {
    const typical: Usage[] = [
      { model: "claude-haiku-5-5", inputTokens: 900, outputTokens: 2500 },
      { model: "claude-sonnet-5-5", inputTokens: 2500, outputTokens: 1000 },
    ];
    expect(costEur(typical, 0.92)).toBeLessThan(0.02);
  });
});
