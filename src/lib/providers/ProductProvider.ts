import type { Category, Product } from "@/lib/types";

/** What the pipeline asks a provider for, usually one gift concept at a time. */
export interface ProductQuery {
  keywords: string[];
  category?: Category;
  /** Soft hint only. Hard budget filtering happens later in code (see filters.ts). */
  maxPriceEur?: number;
  limit?: number;
}

/**
 * Any source of real products: the built-in catalog today, affiliate feeds
 * (bol.com, Amazon Associates, Awin) later. Providers must only return
 * products that really exist in their source. Nothing is ever generated.
 */
export interface ProductProvider {
  readonly name: string;
  search(query: ProductQuery): Promise<Product[]>;
  getById(id: string): Promise<Product | null>;
}
