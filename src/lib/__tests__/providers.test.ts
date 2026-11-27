import { describe, expect, it } from "vitest";
import { CatalogProvider } from "@/lib/providers/CatalogProvider";
import { MultiProvider } from "@/lib/providers/MultiProvider";
import { getProductProvider, type ProductProvider } from "@/lib/providers";
import { CATALOG_STORES, CATEGORIES } from "@/lib/types";
import { makeProduct } from "./fixtures";

describe("built-in catalog", () => {
  const catalog = new CatalogProvider();
  const all = catalog.all();

  it("has about 200 valid products with unique ids", () => {
    expect(all.length).toBeGreaterThanOrEqual(200);
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
  });

  it("links only to real store websites", () => {
    const hosts = new Set(all.map((p) => new URL(p.url).hostname));
    expect([...hosts].sort()).toEqual(["www.amazon.nl", "www.bol.com", "www.coolblue.nl"]);
    for (const p of all) expect(CATALOG_STORES).toContain(p.store);
  });

  it("covers every category", () => {
    const used = new Set(all.map((p) => p.category));
    for (const c of CATEGORIES) expect(used.has(c), c).toBe(true);
  });

  it("finds products by keyword, best match first", async () => {
    const res = await catalog.search({ keywords: ["padel"], limit: 5 });
    expect(res.length).toBeGreaterThan(0);
    expect(res.every((p) => p.tags.includes("padel"))).toBe(true);
  });

  it("can restrict a search to one category", async () => {
    const res = await catalog.search({ keywords: ["coffee"], category: "kitchen" });
    expect(res.every((p) => p.category === "kitchen")).toBe(true);
  });

  it("returns nothing for nonsense keywords instead of guessing", async () => {
    expect(await catalog.search({ keywords: ["zzqxv"] })).toEqual([]);
  });

  it("looks products up by id", async () => {
    expect(await catalog.getById(all[0].id)).toEqual(all[0]);
    expect(await catalog.getById("nope")).toBeNull();
  });
});

function fakeStore(name: string, ids: string[]): ProductProvider {
  const products = ids.map((id) => makeProduct({ id, store: name, provider: name }));
  return {
    name,
    search: async () => products,
    getById: async (id) => products.find((p) => p.id === id) ?? null,
  };
}

describe("MultiProvider (several stores at once)", () => {
  it("interleaves results so each store gets a fair share", async () => {
    const multi = new MultiProvider([fakeStore("bol", ["b1", "b2", "b3"]), fakeStore("amazon", ["a1", "a2"])]);
    const res = await multi.search({ keywords: ["x"], limit: 4 });
    expect(res.map((p) => p.id)).toEqual(["b1", "a1", "b2", "a2"]);
  });

  it("keeps working when one store fails", async () => {
    const broken: ProductProvider = {
      name: "broken",
      search: async () => { throw new Error("down"); },
      getById: async () => null,
    };
    const multi = new MultiProvider([broken, fakeStore("bol", ["b1"])]);
    expect((await multi.search({ keywords: ["x"] })).map((p) => p.id)).toEqual(["b1"]);
    expect(await multi.getById("b1")).not.toBeNull();
  });
});

describe("getProductProvider", () => {
  it("uses the catalog by default and rejects unknown names", () => {
    expect(getProductProvider(undefined).name).toBe("catalog");
    expect(() => getProductProvider("nope")).toThrow(/Unknown product provider/);
  });

  it("combines several providers", () => {
    expect(getProductProvider("catalog, catalog").name).toBe("catalog+catalog");
  });
});

describe("keywordScore", () => {
  const p = makeProduct({ title: "Smart Garden", tags: ["men", "black coffee"], category: "garden-plants" });
  it("matches whole words only", async () => {
    const { keywordScore } = await import("@/lib/providers/CatalogProvider");
    expect(keywordScore(p, ["documentaries"])).toBe(0); // contains "men" but not as a word
    expect(keywordScore(p, ["art"])).toBe(0); // inside "Smart"
    expect(keywordScore(p, ["coffee"])).toBeGreaterThan(0); // word inside "black coffee"
    expect(keywordScore(p, ["garden"])).toBeGreaterThan(0);
  });
});
