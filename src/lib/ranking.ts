import type { Product } from "@/lib/types";

export interface ScoredProduct {
  product: Product;
  /** 0-100, higher is a better fit. */
  fitScore: number;
}

/** Removes duplicate products (same id), keeping the highest score. */
export function dedupe(items: ScoredProduct[]): ScoredProduct[] {
  const best = new Map<string, ScoredProduct>();
  for (const item of items) {
    const prev = best.get(item.product.id);
    if (!prev || item.fitScore > prev.fitScore) best.set(item.product.id, item);
  }
  return [...best.values()];
}

/**
 * Sorts by fit score and enforces diversity: at most `maxPerCategory`
 * items from the same category in the final list.
 */
export function diversify(
  items: ScoredProduct[],
  { limit = 10, maxPerCategory = 2 }: { limit?: number; maxPerCategory?: number } = {},
): ScoredProduct[] {
  const sorted = dedupe(items).sort(
    (a, b) => b.fitScore - a.fitScore || a.product.priceEur - b.product.priceEur,
  );
  const perCategory = new Map<string, number>();
  const out: ScoredProduct[] = [];
  for (const item of sorted) {
    const n = perCategory.get(item.product.category) ?? 0;
    if (n >= maxPerCategory) continue;
    perCategory.set(item.product.category, n + 1);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Picks a "surprise me" item: the best-scoring product from a category that
 * is not already in the main list. Returns null if there is none.
 */
export function pickWildcard(
  candidates: ScoredProduct[],
  chosen: ScoredProduct[],
): ScoredProduct | null {
  const usedIds = new Set(chosen.map((c) => c.product.id));
  const usedCats = new Set(chosen.map((c) => c.product.category));
  const pool = candidates
    .filter((c) => !usedIds.has(c.product.id) && !usedCats.has(c.product.category))
    .sort((a, b) => b.fitScore - a.fitScore);
  return pool[0] ?? null;
}
