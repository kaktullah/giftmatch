export const dynamic = "force-dynamic";

import Link from "next/link";
import { CatalogProvider } from "@/lib/providers/CatalogProvider";
import { isDemoMode } from "@/lib/config";

export default function Home() {
  const products = new CatalogProvider().all();
  const stores = [...new Set(products.map((p) => p.store))];

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-12">
      <h1 className="text-4xl font-bold tracking-tight">GiftMatch</h1>
      <p className="text-lg text-neutral-600 dark:text-neutral-300">
        Tell us about the person. Get a shortlist of real gifts you can buy today, each with a
        reason why it fits them.
      </p>
      <div className="rounded-xl border border-neutral-200 p-4 text-sm dark:border-neutral-800">
        <p>
          <strong>{products.length}</strong> real products from {stores.join(", ")}.
        </p>
        {isDemoMode() && (
          <p className="mt-2 text-amber-700 dark:text-amber-400">
            Demo mode: no AI key configured yet.
          </p>
        )}
      </div>
      <Link
        href="/find"
        className="rounded-full bg-neutral-900 px-6 py-3 text-center font-medium text-white dark:bg-white dark:text-neutral-900"
      >
        Find a gift
      </Link>
    </main>
  );
}
