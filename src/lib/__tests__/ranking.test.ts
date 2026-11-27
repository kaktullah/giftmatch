import { describe, expect, it } from "vitest";
import { dedupe, diversify, pickWildcard, type ScoredProduct } from "@/lib/ranking";
import { makeProduct } from "./fixtures";
import type { Category } from "@/lib/types";

function sp(id: string, category: Category, fitScore: number, priceEur = 30): ScoredProduct {
  return { product: makeProduct({ id, category, priceEur }), fitScore };
}

describe("dedupe", () => {
  it("keeps the highest score per product", () => {
    const out = dedupe([sp("a", "kitchen", 50), sp("a", "kitchen", 80), sp("b", "books", 10)]);
    expect(out.find((x) => x.product.id === "a")?.fitScore).toBe(80);
    expect(out).toHaveLength(2);
  });
});

describe("diversify", () => {
  it("sorts by fit score and allows max 2 per category", () => {
    const out = diversify([
      sp("k1", "kitchen", 90),
      sp("k2", "kitchen", 85),
      sp("k3", "kitchen", 80),
      sp("b1", "books", 70),
    ]);
    expect(out.map((x) => x.product.id)).toEqual(["k1", "k2", "b1"]);
  });

  it("respects the limit", () => {
    const cats: Category[] = ["kitchen", "books", "gaming", "audio-music", "home-decor", "accessories"];
    const items = cats.flatMap((c, i) => [sp(`${c}-1`, c, 100 - i), sp(`${c}-2`, c, 50 - i)]);
    expect(diversify(items, { limit: 10 })).toHaveLength(10);
    expect(diversify(items, { limit: 3 })).toHaveLength(3);
  });

  it("breaks ties with the cheaper product", () => {
    const out = diversify([sp("exp", "kitchen", 80, 100), sp("cheap", "books", 80, 20)]);
    expect(out[0].product.id).toBe("cheap");
  });
});

describe("pickWildcard", () => {
  it("picks the best product from a category not already shown", () => {
    const chosen = [sp("k1", "kitchen", 90)];
    const candidates = [sp("k2", "kitchen", 95), sp("g1", "gaming", 40), sp("b1", "books", 60)];
    expect(pickWildcard(candidates, chosen)?.product.id).toBe("b1");
  });

  it("returns null when every category is already used", () => {
    expect(pickWildcard([sp("k2", "kitchen", 95)], [sp("k1", "kitchen", 90)])).toBeNull();
  });
});
