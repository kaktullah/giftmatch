import type { Product } from "@/lib/types";
import type { ProductProvider, ProductQuery } from "./ProductProvider";

/**
 * Asks several providers (stores / affiliate networks) at once and merges
 * the results. If one store is down, the others still answer.
 */
export class MultiProvider implements ProductProvider {
  readonly name: string;

  constructor(private readonly providers: ProductProvider[]) {
    if (providers.length === 0) throw new Error("MultiProvider needs at least one provider");
    this.name = providers.map((p) => p.name).join("+");
  }

  async search(query: ProductQuery): Promise<Product[]> {
    const limit = query.limit ?? 10;
    const results = await Promise.allSettled(this.providers.map((p) => p.search(query)));
    const lists = results.flatMap((r, i) => {
      if (r.status === "fulfilled") return [r.value];
      console.warn(`[provider:${this.providers[i].name}] search failed`, r.reason);
      return [];
    });
    // Interleave so every store gets a fair share of the top spots.
    const merged: Product[] = [];
    const seen = new Set<string>();
    for (let i = 0; merged.length < limit && lists.some((l) => i < l.length); i++) {
      for (const list of lists) {
        const p = list[i];
        if (p && !seen.has(p.id)) {
          seen.add(p.id);
          merged.push(p);
          if (merged.length >= limit) break;
        }
      }
    }
    return merged;
  }

  async getById(id: string): Promise<Product | null> {
    for (const p of this.providers) {
      const found = await p.getById(id).catch(() => null);
      if (found) return found;
    }
    return null;
  }
}
