/**
 * Runs the full recommendation pipeline for every persona in eval/personas.json
 * and writes a markdown report to eval/results/, so prompt versions can be
 * compared side by side.
 *
 *   npm run eval            # AI pipeline if ANTHROPIC_API_KEY is set, else demo ranking
 *   npm run eval -- --demo  # force demo ranking (free, no API calls)
 *   npm run eval -- --only student-20,teen-gamer
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { IntakeSchema, buildProfile } from "../src/lib/intake";
import { demoRecommend, type Recommendation } from "../src/lib/demoRecommend";
import { aiRecommend } from "../src/lib/ai/pipeline";
import { AnthropicLlm, type Usage } from "../src/lib/ai/llm";
import { costEur } from "../src/lib/ai/cost";
import { PROMPT_VERSIONS } from "../src/lib/ai/prompts";
import { getProductProvider } from "../src/lib/providers";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: fine, env vars may come from the shell.
}

interface Persona {
  id: string;
  label: string;
  daysFromNow: number;
  intake: Record<string, unknown>;
}

interface Row {
  persona: Persona;
  items: Recommendation[];
  wildcard: Recommendation | null;
  filteredOut: number;
  usage: Usage[];
  ms: number;
  error?: string;
  checks: string[];
}

const args = process.argv.slice(2);
const forceDemo = args.includes("--demo");
const onlyArg = args[args.indexOf("--only") + 1];
const only = args.includes("--only") && onlyArg ? new Set(onlyArg.split(",")) : null;

const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
const mode = forceDemo || !apiKey ? "demo" : "ai";
const conceptModel = process.env.ANTHROPIC_MODEL_CONCEPTS ?? "claude-haiku-5-5";
const rerankModel = process.env.ANTHROPIC_MODEL_RERANK ?? "claude-sonnet-5-5";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Rules every result must follow, whatever the prompt says. */
function checkRules(items: Recommendation[], budget: { min: number; max: number }): string[] {
  const issues: string[] = [];
  const perCat = new Map<string, number>();
  for (const r of items) {
    if (r.product.priceEur < budget.min || r.product.priceEur > budget.max) issues.push(`over/under budget: ${r.product.title}`);
    if (!r.reason.trim()) issues.push(`empty reason: ${r.product.title}`);
    perCat.set(r.product.category, (perCat.get(r.product.category) ?? 0) + 1);
  }
  for (const [cat, n] of perCat) if (n > 2) issues.push(`${n}× ${cat}`);
  return issues;
}

function esc(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

async function main() {
  const personas = (JSON.parse(readFileSync("eval/personas.json", "utf8")) as Persona[]).filter(
    (p) => !only || only.has(p.id),
  );
  const provider = getProductProvider();
  const llm = mode === "ai" ? new AnthropicLlm(apiKey) : null;
  const rows: Row[] = [];

  for (const persona of personas) {
    const neededBy = isoDate(new Date(Date.now() + persona.daysFromNow * 86_400_000));
    const intake = IntakeSchema.parse({ ...persona.intake, neededBy });
    const profile = buildProfile(intake);
    const started = Date.now();
    process.stdout.write(`${persona.id} … `);
    let row: Row;
    try {
      const r = llm
        ? await aiRecommend(profile, provider, llm, { conceptModel, rerankModel })
        : { ...(await demoRecommend(profile, provider)), usage: [] as Usage[] };
      row = { persona, items: r.items, wildcard: r.wildcard, filteredOut: r.filteredOut, usage: r.usage, ms: Date.now() - started, checks: [] };
    } catch (err) {
      row = { persona, items: [], wildcard: null, filteredOut: 0, usage: [], ms: Date.now() - started, checks: [], error: err instanceof Error ? err.message : String(err) };
    }
    row.checks = checkRules(row.items, { min: intake.budgetMinEur, max: intake.budgetMaxEur });
    rows.push(row);
    console.log(row.error ? `error: ${row.error}` : `${row.items.length} items, €${costEur(row.usage).toFixed(4)}`);
  }

  const version = mode === "ai" ? `${PROMPT_VERSIONS.concepts}+${PROMPT_VERSIONS.rerank}` : "demo-v1";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const totalCost = rows.reduce((s, r) => s + costEur(r.usage), 0);
  const ok = rows.filter((r) => !r.error);

  const md: string[] = [
    `# GiftMatch eval · ${version}`,
    "",
    `- Run: ${new Date().toISOString()}`,
    `- Mode: **${mode}**${mode === "ai" ? ` (concepts: \`${conceptModel}\`, rerank: \`${rerankModel}\`)` : " (rule-based, no AI)"}`,
    `- Personas: ${rows.length} · errors: ${rows.length - ok.length} · rule violations: ${rows.reduce((s, r) => s + r.checks.length, 0)}`,
    `- Cost: €${totalCost.toFixed(4)} total · €${(totalCost / Math.max(1, ok.length)).toFixed(4)} per recommendation (target < €0.02)`,
    "",
    "| Persona | Results | Wildcard | Filtered out | Tokens in/out | Cost € | Time s | Issues |",
    "| --- | ---: | :---: | ---: | --- | ---: | ---: | --- |",
    ...rows.map((r) => {
      const tin = r.usage.reduce((s, u) => s + u.inputTokens, 0);
      const tout = r.usage.reduce((s, u) => s + u.outputTokens, 0);
      const issues = r.error ? `error: ${esc(r.error)}` : r.checks.map(esc).join("; ") || "–";
      return `| ${esc(r.persona.label)} | ${r.items.length} | ${r.wildcard ? "yes" : "–"} | ${r.filteredOut} | ${tin}/${tout} | ${costEur(r.usage).toFixed(4)} | ${(r.ms / 1000).toFixed(1)} | ${issues} |`;
    }),
    "",
  ];

  for (const r of rows) {
    const i = r.persona.intake as { budgetMinEur: number; budgetMaxEur: number; interestText: string; interestTags: string[] };
    md.push(
      `## ${r.persona.label}`,
      "",
      `> €${i.budgetMinEur}–${i.budgetMaxEur} · needed in ${r.persona.daysFromNow} day(s) · tags: ${i.interestTags.join(", ")} · "${i.interestText}"`,
      "",
    );
    if (r.error) md.push(`**Error:** ${r.error}`, "");
    if (!r.items.length && !r.error) md.push("_No results._", "");
    if (r.items.length) {
      md.push("| # | Product | € | Store | Category | Fit | Reason |", "| ---: | --- | ---: | --- | --- | ---: | --- |");
      r.items.forEach((x, n) =>
        md.push(`| ${n + 1} | ${esc(x.product.title)} | ${x.product.priceEur} | ${x.product.store} | ${x.product.category} | ${x.fitScore} | ${esc(x.reason)} |`),
      );
      md.push("");
    }
    if (r.wildcard) md.push(`**Wildcard:** ${r.wildcard.product.title} (€${r.wildcard.product.priceEur}) – ${r.wildcard.reason}`, "");
  }

  mkdirSync("eval/results", { recursive: true });
  const file = join("eval/results", `${stamp}-${version}.md`);
  writeFileSync(file, md.join("\n"));
  console.log(`\nReport: ${file}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
