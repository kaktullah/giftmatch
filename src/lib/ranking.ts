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
 * items from the same category, and preferably at most `maxPerStore` from
 * one store, so results don't all come from the same shop.
 */
export function diversify(
  items: ScoredProduct[],
  {
    limit = 10,
    maxPerCategory = 2,
    maxPerStore = 4,
  }: { limit?: number; maxPerCategory?: number; maxPerStore?: number } = {},
): ScoredProduct[] {
  const sorted = dedupe(items).sort(
    (a, b) => b.fitScore - a.fitScore || a.product.priceEur - b.product.priceEur,
  );
  const perCategory = new Map<string, number>();
  const perStore = new Map<string, number>();
  const out: ScoredProduct[] = [];
  const skipped: ScoredProduct[] = [];
  for (const item of sorted) {
    const n = perCategory.get(item.product.category) ?? 0;
    if (n >= maxPerCategory) continue;
    const s = perStore.get(item.product.store) ?? 0;
    if (s >= maxPerStore) {
      skipped.push(item);
      continue;
    }
    perCategory.set(item.product.category, n + 1);
    perStore.set(item.product.store, s + 1);
    out.push(item);
    if (out.length >= limit) break;
  }
  // The store limit only spreads results; it never leaves the list short.
  for (const item of skipped) {
    if (out.length >= limit) break;
    const n = perCategory.get(item.product.category) ?? 0;
    if (n >= maxPerCategory) continue;
    perCategory.set(item.product.category, n + 1);
    out.push(item);
  }
  return out.sort((a, b) => b.fitScore - a.fitScore || a.product.priceEur - b.product.priceEur);
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
