/**
 * Builds data/catalog.json from data/catalog-source.txt.
 * Run: npm run catalog:generate
 *
 * Links are the store's own search page for the exact product name. That is
 * the honest choice without a live feed: we never make up product page URLs.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ProductSchema, type Product } from "../src/lib/types";

const STORE_INFO: Record<string, { searchUrl: (q: string) => string; deliveryDays: number; shipsTo: string[] }> = {
  "bol.com": { searchUrl: (q) => `https://www.bol.com/nl/nl/s/?searchtext=${q}`, deliveryDays: 2, shipsTo: ["NL", "BE"] },
  Coolblue: { searchUrl: (q) => `https://www.coolblue.nl/zoeken?query=${q}`, deliveryDays: 2, shipsTo: ["NL", "BE"] },
  "Amazon.nl": { searchUrl: (q) => `https://www.amazon.nl/s?k=${q}`, deliveryDays: 3, shipsTo: ["NL", "BE"] },
};

function slug(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

const root = join(__dirname, "..");
const lines = readFileSync(join(root, "data/catalog-source.txt"), "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));

const seen = new Set<string>();
const products: Product[] = lines.map((line, i) => {
  const parts = line.split("|").map((s) => s.trim());
  if (parts.length !== 7) throw new Error(`Line ${i + 1}: expected 7 fields, got ${parts.length}: ${line}`);
  const [title, brand, category, tags, price, store, clothing] = parts;
  const info = STORE_INFO[store];
  if (!info) throw new Error(`Line ${i + 1}: unknown store "${store}"`);
  const id = `catalog-${slug(title)}`;
  if (seen.has(id)) throw new Error(`Duplicate product: ${title}`);
  seen.add(id);
  return ProductSchema.parse({
    id,
    title,
    brand,
    category,
    tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
    priceEur: Number(price),
    priceIsApproximate: true,
    store,
    provider: "catalog",
    url: info.searchUrl(encodeURIComponent(title)),
    imageUrl: null,
    inStock: true,
    deliveryDays: info.deliveryDays,
    shipsTo: info.shipsTo,
    isClothing: clothing === "y",
  });
});

writeFileSync(join(root, "data/catalog.json"), JSON.stringify(products, null, 2) + "\n");
console.log(`Wrote ${products.length} products to data/catalog.json`);
