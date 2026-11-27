import type { RecipientProfile } from "@/lib/intake";
import { applyHardFilters } from "@/lib/filters";
import { diversify, pickWildcard, type ScoredProduct } from "@/lib/ranking";
import type { ProductProvider } from "@/lib/providers";
import { keywordScore } from "@/lib/providers/CatalogProvider";
import type { Product } from "@/lib/types";

export interface Feedback {
  /** Products the user marked "more like this". */
  liked: string[];
  /** Products the user marked "not this". */
  disliked: string[];
}

export interface Recommendation {
  product: Product;
  fitScore: number;
  reason: string;
  wildcard: boolean;
}

export interface RecommendResult {
  items: Recommendation[];
  wildcard: Recommendation | null;
  /** How many products were removed by the hard filters. */
  filteredOut: number;
}

/** Which of the user's own words this product matches. */
function matchedKeywords(product: Product, keywords: string[]): string[] {
  return keywords.filter((k) => keywordScore(product, [k]) > 0);
}

function styleBonus(p: Product, style: RecipientProfile["style"]): number {
  let bonus = 0;
  // Experience ↔ physical object
  if (p.category === "experiences") bonus += (50 - style.experienceObject) / 10;
  // Practical ↔ sentimental
  const sentimental = p.tags.some((t) => ["sentimental", "memories", "photos", "journal"].includes(t));
  const practical = p.tags.includes("practical");
  if (sentimental) bonus += (style.practicalSentimental - 50) / 10;
  if (practical) bonus += (50 - style.practicalSentimental) / 10;
  // Classic ↔ trendy
  if (p.tags.includes("trendy")) bonus += (style.classicTrendy - 50) / 10;
  if (p.tags.includes("classic")) bonus += (50 - style.classicTrendy) / 10;
  return bonus;
}

function demoReason(p: Product, matched: string[], profile: RecipientProfile): string {
  const own = matched.filter((m) => profile.keywords.includes(m)).slice(0, 2);
  if (own.length === 2) return `Fits what you told us: ${own[0]} and ${own[1]}.`;
  if (own.length === 1) return `Picked because you mentioned ${own[0]}.`;
  return `A well-rated ${p.category.replace("-", " & ")} gift within your budget.`;
}

/**
 * Demo pipeline used when no AI key is configured. Rule-based, but follows
 * the same rules as the real one: only provider products, hard filters in
 * code, max 2 per category, one wildcard.
 */
export async function demoRecommend(
  profile: RecipientProfile,
  provider: ProductProvider,
  feedback: Feedback = { liked: [], disliked: [] },
  today?: Date,
): Promise<RecommendResult> {
  // "More like this": borrow the tags of liked products as extra search words.
  const liked = (await Promise.all(feedback.liked.map((id) => provider.getById(id)))).filter(
    (p): p is Product => p !== null,
  );
  const likedTags = [...new Set(liked.flatMap((p) => p.tags))];
  const searchWords = [...new Set([...profile.keywords, ...likedTags])];

  // 1. Fetch candidates from the providers.
  const found = await Promise.all(searchWords.map((kw) => provider.search({ keywords: [kw], limit: 25 })));
  const byId = new Map<string, Product>();
  for (const p of found.flat()) byId.set(p.id, p);
  const disliked = new Set(feedback.disliked);
  const candidates = [...byId.values()].filter((p) => !disliked.has(p.id));

  // 2. Hard filters, in code.
  const { kept, rejected } = applyHardFilters(candidates, {
    budgetMinEur: profile.budget.minEur,
    budgetMaxEur: profile.budget.maxEur,
    neededBy: profile.neededBy,
    today,
    country: profile.country,
    avoid: profile.avoid,
    allowClothing: profile.allowClothing,
  });

  // 3. Score: the user's own words count most, liked tags a bit.
  const scored: (ScoredProduct & { matched: string[] })[] = kept.map((product) => {
    const own = keywordScore(product, profile.keywords);
    const fromLikes = keywordScore(product, likedTags) * 0.3;
    const raw = own * 8 + fromLikes * 8 + styleBonus(product, profile.style);
    return {
      product,
      fitScore: Math.max(0, Math.min(100, Math.round(raw))),
      matched: matchedKeywords(product, profile.keywords),
    };
  });

  // 4. Diversity + wildcard.
  const top = diversify(scored, { limit: 10, maxPerCategory: 2 });
  const wild = pickWildcard(scored, top);
  const toRec = (s: ScoredProduct, wildcard: boolean): Recommendation => ({
    product: s.product,
    fitScore: s.fitScore,
    reason: wildcard
      ? "Something a little different, to surprise them."
      : demoReason(s.product, matchedKeywords(s.product, profile.keywords), profile),
    wildcard,
  });

  return {
    items: top.map((s) => toRec(s, false)),
    wildcard: wild ? toRec(wild, true) : null,
    filteredOut: rejected.length,
  };
}
