import type { Usage } from "./llm";

/** USD per million tokens [input, output]. Unknown models count as the most expensive listed. */
const PRICES_USD: Record<string, [number, number]> = {
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-sonnet-5-5": [2, 10],
  "claude-opus-5-5": [4, 20],
};
const FALLBACK: [number, number] = [4, 20];

export function costEur(usage: Usage[], eurPerUsd = Number(process.env.EUR_PER_USD ?? 0.92)): number {
  const usd = usage.reduce((sum, u) => {
    const [inp, out] = PRICES_USD[u.model] ?? FALLBACK;
    return sum + (u.inputTokens * inp + u.outputTokens * out) / 1_000_000;
  }, 0);
  return usd * eurPerUsd;
}
