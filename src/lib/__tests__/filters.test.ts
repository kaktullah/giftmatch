import { describe, expect, it } from "vitest";
import { applyHardFilters, daysUntil, matchesAvoidList, type HardFilterCriteria } from "@/lib/filters";
import { makeProduct } from "./fixtures";

const today = new Date("2026-12-01T10:00:00Z");
const base: HardFilterCriteria = {
  budgetMinEur: 20,
  budgetMaxEur: 50,
  neededBy: "2026-12-05",
  today,
  country: "NL",
  avoid: [],
  allowClothing: false,
};

function reasonFor(overrides: Parameters<typeof makeProduct>[0], criteria: Partial<HardFilterCriteria> = {}) {
  const r = applyHardFilters([makeProduct(overrides)], { ...base, ...criteria });
  return r.rejected[0]?.reason ?? "kept";
}

describe("daysUntil", () => {
  it("counts calendar days, ignoring the time of day", () => {
    expect(daysUntil("2026-12-05", today)).toBe(4);
    expect(daysUntil("2026-12-01", today)).toBe(0);
    expect(daysUntil("2026-11-30", today)).toBe(-1);
  });
});

describe("applyHardFilters", () => {
  it("keeps a product that passes every rule", () => {
    expect(reasonFor({})).toBe("kept");
  });

  it("enforces the budget, including the edges", () => {
    expect(reasonFor({ priceEur: 50 })).toBe("kept");
    expect(reasonFor({ priceEur: 20 })).toBe("kept");
    expect(reasonFor({ priceEur: 50.01 })).toBe("over_budget");
    expect(reasonFor({ priceEur: 19.99 })).toBe("under_budget");
  });

  it("drops out-of-stock products", () => {
    expect(reasonFor({ inStock: false })).toBe("out_of_stock");
  });

  it("drops products that cannot ship to the recipient's country", () => {
    expect(reasonFor({}, { country: "DE" })).toBe("no_shipping");
    expect(reasonFor({}, { country: "be" })).toBe("kept");
  });

  it("drops products that arrive after the deadline", () => {
    expect(reasonFor({ deliveryDays: 4 })).toBe("kept");
    expect(reasonFor({ deliveryDays: 5 })).toBe("too_late");
    expect(reasonFor({ deliveryDays: 1 }, { neededBy: "2026-11-30" })).toBe("too_late");
  });

  it("drops clothing unless the user allowed it", () => {
    expect(reasonFor({ isClothing: true })).toBe("clothing_not_allowed");
    expect(reasonFor({ isClothing: true }, { allowClothing: true })).toBe("kept");
  });

  it("drops products on the avoid list", () => {
    expect(reasonFor({ title: "AeroPress Coffee Maker" }, { avoid: ["aeropress"] })).toBe("avoid_list");
  });

  it("splits a mixed list into kept and rejected", () => {
    const products = [
      makeProduct({ id: "ok" }),
      makeProduct({ id: "pricey", priceEur: 200 }),
      makeProduct({ id: "late", deliveryDays: 10 }),
    ];
    const r = applyHardFilters(products, base);
    expect(r.kept.map((p) => p.id)).toEqual(["ok"]);
    expect(r.rejected.map((x) => [x.product.id, x.reason])).toEqual([
      ["pricey", "over_budget"],
      ["late", "too_late"],
    ]);
  });
});

describe("matchesAvoidList", () => {
  const p = makeProduct({ title: "Hario V60 Dripper", brand: "Hario", category: "coffee-tea", tags: ["coffee", "pour over"] });

  it("matches title, brand, category and tags, case-insensitively", () => {
    expect(matchesAvoidList(p, ["V60"])).toBe(true);
    expect(matchesAvoidList(p, ["hario"])).toBe(true);
    expect(matchesAvoidList(p, ["Coffee"])).toBe(true);
    expect(matchesAvoidList(p, ["pour over"])).toBe(true);
  });

  it("ignores empty or one-letter terms and non-matches", () => {
    expect(matchesAvoidList(p, ["", " ", "a"])).toBe(false);
    expect(matchesAvoidList(p, ["candles"])).toBe(false);
  });
});
