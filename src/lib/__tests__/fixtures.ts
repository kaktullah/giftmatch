import type { Product } from "@/lib/types";

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
