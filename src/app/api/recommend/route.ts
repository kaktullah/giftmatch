import { NextResponse } from "next/server";
import { z } from "zod";
import { IntakeSchema, anonymiseProfile, buildProfile } from "@/lib/intake";
import { demoRecommend } from "@/lib/demoRecommend";
import { getProductProvider } from "@/lib/providers";
import { config, isDemoMode } from "@/lib/config";
import { aiRecommend } from "@/lib/ai/pipeline";
import { AnthropicLlm, type Usage } from "@/lib/ai/llm";
import { costEur } from "@/lib/ai/cost";
import { prisma } from "@/lib/db";

const BodySchema = z.object({
  intake: IntakeSchema,
  feedback: z
    .object({ liked: z.array(z.string()).max(50), disliked: z.array(z.string()).max(200) })
    .default({ liked: [], disliked: [] }),
});

export async function POST(req: Request) {
  const started = Date.now();
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", issues: parsed.error.issues }, { status: 400 });
  }

  const profile = buildProfile(parsed.data.intake);
  const provider = getProductProvider();
  const feedback = parsed.data.feedback;

  let mode = "demo";
  let usage: Usage[] = [];
  let promptVersion = "demo-v1";
  let error: string | null = null;
  let result;
  if (isDemoMode()) {
    result = await demoRecommend(profile, provider, feedback);
  } else {
    try {
      const ai = await aiRecommend(profile, provider, new AnthropicLlm(config.anthropicApiKey), {
        conceptModel: config.conceptModel,
        rerankModel: config.rerankModel,
      }, feedback);
      result = ai;
      usage = ai.usage;
      promptVersion = ai.promptVersion;
      mode = "ai";
    } catch (err) {
      // Fail gracefully: the user still gets rule-based results.
      console.error("[recommend] AI pipeline failed, using demo ranking", err);
      error = err instanceof Error ? err.message.slice(0, 500) : "unknown error";
      result = await demoRecommend(profile, provider, feedback);
      mode = "demo-fallback";
    }
  }
  const inputTokens = usage.reduce((s, u) => s + u.inputTokens, 0);
  const outputTokens = usage.reduce((s, u) => s + u.outputTokens, 0);
  const cost = costEur(usage);
  if (usage.length) console.info(`[recommend] tokens in=${inputTokens} out=${outputTokens} cost=€${cost.toFixed(4)}`);

  // Anonymised logging. A logging failure must never break the user's results.
  let requestId: string | null = null;
  // No database configured (e.g. a free demo deployment): skip logging.
  if (process.env.DATABASE_URL) try {
    const all = [...result.items, ...(result.wildcard ? [result.wildcard] : [])];
    const row = await prisma.recommendationRequest.create({
      data: {
        profileJson: JSON.stringify(anonymiseProfile(profile)),
        promptVersion,
        mode,
        conceptModel: mode === "ai" ? config.conceptModel : null,
        rerankModel: mode === "ai" ? config.rerankModel : null,
        inputTokens,
        outputTokens,
        costEur: cost,
        error,
        durationMs: Date.now() - started,
        items: {
          create: all.map((r, i) => ({
            productId: r.product.id,
            provider: r.product.provider,
            rank: i + 1,
            fitScore: r.fitScore,
            reason: r.reason,
            wildcard: r.wildcard,
          })),
        },
      },
    });
    requestId = row.id;
  } catch (err) {
    console.warn("[recommend] logging failed", err);
  }

  return NextResponse.json({ requestId, mode, items: result.items, wildcard: result.wildcard, filteredOut: result.filteredOut });
}
