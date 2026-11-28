"use client";

import Link from "next/link";
import { useState } from "react";
import type { Recommendation } from "@/lib/demoRecommend";
import type { ApiResult } from "./Wizard";
import { CATEGORY_EMOJI } from "./labels";

function sendFeedback(requestId: string | null, productId: string, type: "click" | "more_like_this" | "not_this") {
  if (!requestId) return;
  // keepalive lets the request finish even when the user leaves for the shop.
  fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId, productId, type }),
    keepalive: true,
  }).catch(() => {});
}

/** Rough arrival date from the store's usual delivery time. */
function expectedArrival(deliveryDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + deliveryDays);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1); // no Sunday delivery
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function ProductCard({
  rec,
  requestId,
  onMore,
  onNot,
  disabled,
}: {
  rec: Recommendation;
  requestId: string | null;
  onMore: () => void;
  onNot: () => void;
  disabled: boolean;
}) {
  const p = rec.product;
  return (
    <article className={`flex flex-col gap-3 rounded-2xl border p-4 ${rec.wildcard ? "border-amber-400" : "border-neutral-200 dark:border-neutral-800"}`}>
      {rec.wildcard && <span className="text-xs font-semibold uppercase tracking-wide text-amber-600">Surprise pick</span>}
      <div className="flex gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-3xl dark:bg-neutral-900" aria-hidden>
          {p.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.imageUrl} alt="" className="h-full w-full rounded-xl object-cover" />
          ) : (
            CATEGORY_EMOJI[p.category] ?? "🎁"
          )}
        </div>
        <div className="flex min-w-0 flex-col">
          <h3 className="font-semibold leading-snug">{p.title}</h3>
          <p className="text-sm text-neutral-500">
            {p.priceIsApproximate ? "≈ " : ""}€{p.priceEur.toFixed(2).replace(".00", "")} · {p.store}
          </p>
        </div>
      </div>
      <p className="text-sm">{rec.reason}</p>
      <p className="text-xs text-neutral-500">🚚 Expected to arrive around {expectedArrival(p.deliveryDays)} (estimate)</p>
      <a
        href={p.url}
        target="_blank"
        rel="noopener noreferrer sponsored"
        onClick={() => sendFeedback(requestId, p.id, "click")}
        className="rounded-full bg-neutral-900 px-4 py-2 text-center text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
      >
        View at {p.store}
      </a>
      <div className="flex gap-2 text-sm">
        <button type="button" disabled={disabled} onClick={onMore} className="flex-1 rounded-full border border-neutral-300 px-3 py-2 disabled:opacity-50 dark:border-neutral-700">
          More like this
        </button>
        <button type="button" disabled={disabled} onClick={onNot} className="flex-1 rounded-full border border-neutral-300 px-3 py-2 disabled:opacity-50 dark:border-neutral-700">
          Not this
        </button>
      </div>
    </article>
  );
}

export function Results({
  result,
  loading,
  onFeedback,
  onRestart,
}: {
  result: ApiResult;
  loading: boolean;
  onFeedback: (f: { liked: string[]; disliked: string[] }) => void;
  onRestart: () => void;
}) {
  const [liked, setLiked] = useState<string[]>([]);
  const [disliked, setDisliked] = useState<string[]>([]);

  const more = (id: string) => {
    sendFeedback(result.requestId, id, "more_like_this");
    const next = [...new Set([...liked, id])];
    setLiked(next);
    onFeedback({ liked: next, disliked });
  };
  const not = (id: string) => {
    sendFeedback(result.requestId, id, "not_this");
    const next = [...new Set([...disliked, id])];
    setDisliked(next);
    onFeedback({ liked: liked.filter((x) => x !== id), disliked: next });
  };

  const all = [...result.items, ...(result.wildcard ? [result.wildcard] : [])];

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 px-4 py-8">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-sm font-semibold tracking-tight">GiftMatch</Link>
        <button type="button" onClick={onRestart} className="text-sm underline">Start over</button>
      </header>
      <h1 className="text-2xl font-bold">Your gift ideas</h1>
      <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
        {result.mode === "ai" ? "" : "Demo mode: ideas are matched by simple rules, without AI. "}
        Prices are approximate, check the price at the store.
      </p>
      {all.length === 0 ? (
        <p className="text-neutral-600">
          No gifts match all your answers yet. Try a wider budget, a later date or fewer things to avoid.
        </p>
      ) : (
        <div className={`flex flex-col gap-4 ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          {all.map((rec) => (
            <ProductCard
              key={rec.product.id}
              rec={rec}
              requestId={result.requestId}
              disabled={loading}
              onMore={() => more(rec.product.id)}
              onNot={() => not(rec.product.id)}
            />
          ))}
        </div>
      )}
    </main>
  );
}
