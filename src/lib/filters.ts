import type { Product } from "@/lib/types";

/**
 * Hard filters. These run in code, never in the LLM, so a result can never
 * break the budget, the deadline or the avoid list.
 */
export interface HardFilterCriteria {
  budgetMinEur: number;
  budgetMaxEur: number;
  /** Date the gift is needed by (YYYY-MM-DD or Date). */
  neededBy: string | Date;
  /** "Today" for the calculation, injectable for tests. */
  today?: Date;
  /** Recipient country (ISO code) for shipping. */
  country: string;
  /** Things the recipient already owns or should not get. */
  avoid: string[];
  allowClothing: boolean;
}

export type RejectionReason =
  | "over_budget"
  | "under_budget"
  | "out_of_stock"
  | "too_late"
  | "no_shipping"
  | "avoid_list"
  | "clothing_not_allowed";

export interface FilterResult {
  kept: Product[];
  rejected: { product: Product; reason: RejectionReason }[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDayUtc(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function toDate(d: string | Date): Date {
  return typeof d === "string" ? new Date(`${d}T00:00:00Z`) : d;
}

/** Calendar days between today and the deadline (0 = needed today). */
export function daysUntil(neededBy: string | Date, today: Date = new Date()): number {
  return Math.floor((startOfDayUtc(toDate(neededBy)) - startOfDayUtc(today)) / DAY_MS);
}

export function isWithinBudget(p: Product, min: number, max: number): boolean {
  return p.priceEur >= min && p.priceEur <= max;
}

export function arrivesInTime(p: Product, neededBy: string | Date, today?: Date): boolean {
  return p.deliveryDays <= daysUntil(neededBy, today);
}

function norm(s: string): string {
  return s.toLowerCase().trim();
}

/** True if the product matches any avoid term (title, brand, category or tag). */
export function matchesAvoidList(p: Product, avoid: string[]): boolean {
  const haystack = [p.title, p.brand, p.category, ...p.tags].map(norm);
  return avoid
    .map(norm)
    .filter((term) => term.length >= 2)
    .some((term) => haystack.some((h) => h.includes(term)));
}

/** Checks every product and explains why each removed one was dropped. */
export function applyHardFilters(products: Product[], c: HardFilterCriteria): FilterResult {
  const result: FilterResult = { kept: [], rejected: [] };
  const country = c.country.toUpperCase();
  for (const product of products) {
    let reason: RejectionReason | null = null;
    if (product.priceEur > c.budgetMaxEur) reason = "over_budget";
    else if (product.priceEur < c.budgetMinEur) reason = "under_budget";
    else if (!product.inStock) reason = "out_of_stock";
    else if (!product.shipsTo.includes(country)) reason = "no_shipping";
    else if (!arrivesInTime(product, c.neededBy, c.today)) reason = "too_late";
    else if (product.isClothing && !c.allowClothing) reason = "clothing_not_allowed";
    else if (matchesAvoidList(product, c.avoid)) reason = "avoid_list";

    if (reason) result.rejected.push({ product, reason });
    else result.kept.push(product);
  }
  return result;
}
