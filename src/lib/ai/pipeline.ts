import { anonymiseProfile, type RecipientProfile } from "@/lib/intake";
import { applyHardFilters } from "@/lib/filters";
import { diversify, pickWildcard, type ScoredProduct } from "@/lib/ranking";
import type { ProductProvider } from "@/lib/providers";
import { keywordScore } from "@/lib/providers/CatalogProvider";
import { CATEGORIES, type Product } from "@/lib/types";
import type { Feedback, Recommendation, RecommendResult } from "@/lib/demoRecommend";
import { generateWithRetry, type LlmClient, type Usage } from "./llm";
import { loadPrompt, renderPrompt, PROMPT_VERSIONS } from "./prompts";
import { ConceptsSchema, RerankSchema, type Concept } from "./schemas";

export interface AiSettings {
  conceptModel: string;
  rerankModel: string;
  /** Max products sent to the rerank step (keeps the prompt, and cost, small). */
  maxCandidates?: number;
}

export interface AiResult extends RecommendResult {
  usage: Usage[];
  concepts: Concept[];
  promptVersion: string;
}

function profileForPrompt(p: RecipientProfile): string {
  const anon: Partial<ReturnType<typeof anonymiseProfile>> = anonymiseProfile(p);
  delete anon.hasFreeText;
  delete anon.avoidCount;
  return JSON.stringify({ ...anon, gender: p.gender ?? "not given", neededBy: p.neededBy, avoid: p.avoid }, null, 2);
}

function feedbackForPrompt(liked: Product[], disliked: Product[]): string {
  const lines: string[] = [];
  if (liked.length) lines.push(`The giver wants MORE like: ${liked.map((p) => p.title).join("; ")}.`);
  if (disliked.length) lines.push(`The giver rejected: ${disliked.map((p) => p.title).join("; ")}. Avoid similar items.`);
  return lines.join("\n");
}

/**
 * Full recommendation pipeline:
 * profile → LLM concepts → providers → hard filters (code) → LLM rerank → top 10 + wildcard.
 * The LLM only ever picks from provider products; unknown ids are dropped.
 */
export async function aiRecommend(
  profile: RecipientProfile,
  provider: ProductProvider,
  llm: LlmClient,
  settings: AiSettings,
  feedback: Feedback = { liked: [], disliked: [] },
  today?: Date,
): Promise<AiResult> {
  const usage: Usage[] = [];
  const maxCandidates = settings.maxCandidates ?? 40;

  // 1. Concepts (cheap, fast model).
  const conceptPrompt = renderPrompt(loadPrompt(PROMPT_VERSIONS.concepts), {
    profile: profileForPrompt(profile),
    freeText: profile.freeText || "(nothing)",
    count: 24,
    budgetMax: profile.budget.maxEur,
    categories: CATEGORIES.join(", "),
  });
  const { concepts } = await generateWithRetry(
    llm,
    { model: settings.conceptModel, prompt: conceptPrompt, schema: ConceptsSchema },
    usage,
  );

  // 2. Real products for every concept, plus the user's own words.
  const searches = [
    ...concepts.map((c) => ({ keywords: c.searchKeywords, category: c.category, limit: 6 })),
    ...concepts.map((c) => ({ keywords: c.searchKeywords, limit: 4 })),
    { keywords: profile.keywords, limit: 15 },
  ];
  const found = await Promise.all(searches.map((q) => provider.search(q)));
  const hits = new Map<string, { product: Product; count: number }>();
  for (const p of found.flat()) {
    const h = hits.get(p.id);
    if (h) h.count++;
    else hits.set(p.id, { product: p, count: 1 });
  }

  const liked = (await Promise.all(feedback.liked.map((id) => provider.getById(id)))).filter((p): p is Product => !!p);
  const dislikedProducts = (await Promise.all(feedback.disliked.map((id) => provider.getById(id)))).filter((p): p is Product => !!p);
  const disliked = new Set(feedback.disliked);

  // 3. Hard filters in code.
  const { kept, rejected } = applyHardFilters(
    [...hits.values()].map((h) => h.product).filter((p) => !disliked.has(p.id)),
    {
      budgetMinEur: profile.budget.minEur,
      budgetMaxEur: profile.budget.maxEur,
      neededBy: profile.neededBy,
      today,
      country: profile.country,
      avoid: profile.avoid,
      allowClothing: profile.allowClothing,
    },
  );
  const base = { usage, concepts, promptVersion: `${PROMPT_VERSIONS.concepts}+${PROMPT_VERSIONS.rerank}` };
  if (kept.length === 0) return { ...base, items: [], wildcard: null, filteredOut: rejected.length };

  // Keep the most relevant candidates: found by many concepts, matching the user's words.
  const candidates = kept
    .map((p) => ({ p, score: (hits.get(p.id)?.count ?? 0) * 2 + keywordScore(p, profile.keywords) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxCandidates)
    .map(({ p }) => p);
  const byId = new Map(candidates.map((p) => [p.id, p]));

  // 4. Rerank + reasons (stronger model).
  const rerankPrompt = renderPrompt(loadPrompt(PROMPT_VERSIONS.rerank), {
    profile: profileForPrompt(profile),
    freeText: profile.freeText || "(nothing)",
    feedback: feedbackForPrompt(liked, dislikedProducts),
    products: candidates.map((p) => `${p.id} | ${p.title} | ${p.brand} | ${p.category} | €${p.priceEur} | ${p.store}`).join("\n"),
    limit: 10,
  });
  const rerank = await generateWithRetry(
    llm,
    { model: settings.rerankModel, prompt: rerankPrompt, schema: RerankSchema },
    usage,
  );

  // 5. Never trust ids blindly: drop anything that is not a real candidate.
  const reasons = new Map<string, string>();
  const scored: ScoredProduct[] = [];
  for (const pick of rerank.picks) {
    const product = byId.get(pick.productId);
    if (!product || reasons.has(product.id)) continue;
    reasons.set(product.id, pick.reason);
    scored.push({ product, fitScore: Math.max(0, Math.min(100, Math.round(pick.fitScore))) });
  }
  const top = diversify(scored, { limit: 10, maxPerCategory: 2 });

  let wildcard: Recommendation | null = null;
  const wc = rerank.wildcard && byId.get(rerank.wildcard.productId);
  if (wc && !top.some((t) => t.product.id === wc.id)) {
    wildcard = { product: wc, fitScore: 0, reason: rerank.wildcard!.reason, wildcard: true };
  } else {
    const fallback = pickWildcard(
      candidates.map((p) => ({ product: p, fitScore: keywordScore(p, profile.keywords) })),
      top,
    );
    if (fallback) wildcard = { ...fallback, reason: "Something a little different, to surprise them.", wildcard: true };
  }

  return {
    ...base,
    items: top.map((t) => ({ ...t, reason: reasons.get(t.product.id) ?? "", wildcard: false })),
    wildcard,
    filteredOut: rejected.length,
  };
}
