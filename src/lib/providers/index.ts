import { CatalogProvider } from "./CatalogProvider";
import { MultiProvider } from "./MultiProvider";
import type { ProductProvider } from "./ProductProvider";

export type { ProductProvider, ProductQuery } from "./ProductProvider";

/**
 * Registry of available product sources. To add a store, write a class that
 * implements ProductProvider (e.g. BolComProvider, AwinProvider) and add it here.
 */
const registry: Record<string, () => ProductProvider> = {
  catalog: () => new CatalogProvider(),
};

/**
 * Builds the product source from PRODUCT_PROVIDERS, a comma-separated list,
 * e.g. "catalog" today or "bolcom,awin,amazon" later.
 */
export function getProductProvider(env: string | undefined = process.env.PRODUCT_PROVIDERS): ProductProvider {
  const names = (env ?? "catalog").split(",").map((s) => s.trim()).filter(Boolean);
  const providers = names.map((name) => {
    const make = registry[name];
    if (!make) throw new Error(`Unknown product provider "${name}". Available: ${Object.keys(registry).join(", ")}`);
    return make();
  });
  return providers.length === 1 ? providers[0] : new MultiProvider(providers);
}
