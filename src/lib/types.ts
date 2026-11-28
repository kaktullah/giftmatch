import { z } from "zod";

/** Stores used by the built-in catalog. Live providers may return any store name. */
export const CATALOG_STORES = ["bol.com", "Coolblue", "Amazon.nl", "MediaMarkt", "Decathlon", "Douglas"] as const;

export const CATEGORIES = [
  "coffee-tea",
  "kitchen",
  "drinks-bar",
  "sports-fitness",
  "outdoor-travel",
  "tech-gadgets",
  "audio-music",
  "gaming",
  "books",
  "games-puzzles",
  "home-decor",
  "wellness-selfcare",
  "grooming-beauty",
  "accessories",
  "garden-plants",
  "creative-hobby",
  "kids-toys",
  "experiences",
] as const;
export type Category = (typeof CATEGORIES)[number];

/** A real, buyable product returned by a ProductProvider. */
export const ProductSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  brand: z.string().min(1),
  category: z.enum(CATEGORIES),
  tags: z.array(z.string()),
  priceEur: z.number().positive(),
  /** True while prices come from the built-in catalog instead of a live feed. */
  priceIsApproximate: z.boolean(),
  /** Shop name shown to the user, e.g. "bol.com". */
  store: z.string().min(1),
  /** Which provider returned this product, e.g. "catalog" or "bolcom". */
  provider: z.string().min(1),
  url: z.string().url(),
  imageUrl: z.string().url().nullable(),
  inStock: z.boolean(),
  /** Typical delivery time in calendar days. */
  deliveryDays: z.number().int().min(0),
  /** ISO country codes the store ships to. */
  shipsTo: z.array(z.string().length(2)),
  /** Whether the item is clothing (needs sizes). */
  isClothing: z.boolean(),
});
export type Product = z.infer<typeof ProductSchema>;
