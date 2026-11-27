import type { Product } from "@/lib/types";
import type { Intake } from "@/lib/intake";

export function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: overrides.id ?? `p-${Math.random().toString(36).slice(2)}`,
    title: "Test product",
    brand: "TestBrand",
    category: "kitchen",
    tags: [],
    priceEur: 30,
    priceIsApproximate: true,
    store: "bol.com",
    provider: "test",
    url: "https://www.bol.com/nl/nl/s/?searchtext=test",
    imageUrl: null,
    inStock: true,
    deliveryDays: 2,
    shipsTo: ["NL", "BE"],
    isClothing: false,
    ...overrides,
  };
}

export const sampleIntake: Intake = {
  relationship: "parent",
  ageRange: "41-60",
  country: "NL",
  occasion: "birthday",
  neededBy: "2026-12-20",
  budgetMinEur: 20,
  budgetMaxEur: 60,
  interestTags: ["Padel"],
  interestText: "Into padel lately, drinks black coffee, hates clutter",
  style: { practicalSentimental: 30, experienceObject: 60, classicTrendy: 50 },
  avoid: ["candles"],
  allowClothing: false,
};
