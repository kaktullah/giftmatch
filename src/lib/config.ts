/** Server-side settings read from .env. Never import this in client components. */
export const config = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  conceptModel: process.env.ANTHROPIC_MODEL_CONCEPTS ?? "claude-haiku-5-5",
  rerankModel: process.env.ANTHROPIC_MODEL_RERANK ?? "claude-sonnet-5-5",
  defaultCountry: process.env.DEFAULT_COUNTRY ?? "NL",
  defaultCurrency: process.env.DEFAULT_CURRENCY ?? "EUR",
};

/** Without an API key the app runs in demo mode: no AI calls, rule-based results. */
export function isDemoMode(): boolean {
  return config.anthropicApiKey.trim() === "";
}
