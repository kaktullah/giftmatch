import catalogJson from "../../../data/catalog.json";
import { ProductSchema, type Product } from "@/lib/types";
import type { ProductProvider, ProductQuery } from "./ProductProvider";

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s-]/gu, " ");
}

/** How well a product matches the keywords. 0 = no match. */
export function keywordScore(product: Product, keywords: string[]): number {
  const title = normalize(`${product.title} ${product.brand}`);
  const tags = product.tags.map(normalize);
  let score = 0;
  for (const raw of keywords) {
    const kw = normalize(raw).trim();
    if (!kw) continue;
    if (tags.some((t) => t === kw)) score += 3;
    else if (tags.some((t) => t.includes(kw) || kw.includes(t))) score += 2;
    if (title.includes(kw)) score += 2;
    if (product.category.includes(kw)) score += 1;
  }
  return score;
}

/** Provider backed by data/catalog.json: real products from real Dutch shops. */
export class CatalogProvider implements ProductProvider {
  readonly name = "catalog";
  private readonly products: Product[];

  constructor(products?: Product[]) {
    this.products = products ?? ProductSchema.array().parse(catalogJson);
  }

  all(): Product[] {
    return [...this.products];
  }

  async search(query: ProductQuery): Promise<Product[]> {
    const limit = query.limit ?? 10;
    return this.products
      .filter((p) => !query.category || p.category === query.category)
      .map((p) => ({ p, score: keywordScore(p, query.keywords) }))
      .filter(({ score }) => score > 0 || (query.category && query.keywords.length === 0))
      .sort((a, b) => b.score - a.score || a.p.priceEur - b.p.priceEur)
      .slice(0, limit)
      .map(({ p }) => p);
  }

  async getById(id: string): Promise<Product | null> {
    return this.products.find((p) => p.id === id) ?? null;
  }
}
