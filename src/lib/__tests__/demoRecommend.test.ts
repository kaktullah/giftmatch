import { describe, expect, it } from "vitest";
import { demoRecommend } from "@/lib/demoRecommend";
import { buildProfile } from "@/lib/intake";
import { CatalogProvider } from "@/lib/providers/CatalogProvider";
import { sampleIntake } from "./fixtures";

const today = new Date("2026-12-01T09:00:00Z");
const catalog = new CatalogProvider();
const catalogIds = new Set(catalog.all().map((p) => p.id));

describe("demoRecommend", () => {
  it("returns only real catalog products within budget, max 2 per category", async () => {
    const r = await demoRecommend(buildProfile(sampleIntake), catalog, undefined, today);
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.items.length).toBeLessThanOrEqual(10);
    const perCat = new Map<string, number>();
    for (const rec of r.items) {
      expect(catalogIds.has(rec.product.id)).toBe(true);
      expect(rec.product.priceEur).toBeGreaterThanOrEqual(20);
      expect(rec.product.priceEur).toBeLessThanOrEqual(60);
      perCat.set(rec.product.category, (perCat.get(rec.product.category) ?? 0) + 1);
    }
    expect(Math.max(...perCat.values())).toBeLessThanOrEqual(2);
  });

  it("ranks the user's own interests first and says so in the reason", async () => {
    const r = await demoRecommend(buildProfile(sampleIntake), catalog, undefined, today);
    const first = r.items[0];
    expect(first.product.tags.some((t) => ["padel", "coffee", "black coffee"].includes(t))).toBe(true);
    expect(first.reason).toMatch(/padel|coffee/);
  });

  it("never shows a product the user said 'not this' to", async () => {
    const profile = buildProfile(sampleIntake);
    const first = (await demoRecommend(profile, catalog, undefined, today)).items[0];
    const again = await demoRecommend(profile, catalog, { liked: [], disliked: [first.product.id] }, today);
    const ids = [...again.items, ...(again.wildcard ? [again.wildcard] : [])].map((x) => x.product.id);
    expect(ids).not.toContain(first.product.id);
  });

  it("respects the avoid list", async () => {
    const profile = buildProfile({ ...sampleIntake, avoid: ["coffee"] });
    const r = await demoRecommend(profile, catalog, undefined, today);
    for (const rec of r.items) expect(rec.product.tags.join(" ")).not.toContain("coffee");
  });

  it("returns nothing when the deadline is impossible", async () => {
    const profile = buildProfile({ ...sampleIntake, neededBy: "2026-12-01" });
    const r = await demoRecommend(profile, catalog, undefined, today);
    expect(r.items).toEqual([]);
    expect(r.filteredOut).toBeGreaterThan(0);
  });

  it("puts the wildcard in a category not already shown", async () => {
    const r = await demoRecommend(buildProfile(sampleIntake), catalog, undefined, today);
    if (r.wildcard) {
      expect(r.items.map((i) => i.product.category)).not.toContain(r.wildcard.product.category);
    }
  });
});

describe("budget is a cap, not a target", () => {
  it("does not push pricier gifts when the budget goes up", async () => {
    const avg = async (max: number) => {
      const r = await demoRecommend(buildProfile({ ...sampleIntake, budgetMinEur: 0, budgetMaxEur: max }), catalog, undefined, today);
      return r.items.slice(0, 3).map((x) => x.product.priceEur);
    };
    const low = await avg(100);
    const high = await avg(5000);
    // The best picks under €100 are still the best picks with €5,000 to spend.
    expect(high).toEqual(low);
  });

  it("accepts budgets far above €5,000", async () => {
    const { IntakeSchema } = await import("@/lib/intake");
    expect(IntakeSchema.safeParse({ ...sampleIntake, budgetMaxEur: 25000 }).success).toBe(true);
  });
});
