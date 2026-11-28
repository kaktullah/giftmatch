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

describe("diversify across stores", () => {
  it("spreads results over stores but still fills the list", () => {
    const cats: Category[] = ["kitchen", "books", "gaming", "audio-music", "home-decor", "accessories"];
    const items: ScoredProduct[] = cats.map((c, i) => ({
      product: makeProduct({ id: `bol-${c}`, category: c, store: "bol.com" }),
      fitScore: 100 - i,
    }));
    items.push({ product: makeProduct({ id: "mm", category: "tech-gadgets", store: "MediaMarkt" }), fitScore: 10 });
    const out = diversify(items, { limit: 5, maxPerStore: 4 });
    expect(out).toHaveLength(5);
    expect(out.map((x) => x.product.id)).toContain("mm");
    expect(out.filter((x) => x.product.store === "bol.com")).toHaveLength(4);
    // A short catalog still fills up from the same store.
    expect(diversify(items.slice(0, 6), { limit: 6, maxPerStore: 4 })).toHaveLength(6);
  });
});
