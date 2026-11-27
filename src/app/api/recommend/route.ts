import { NextResponse } from "next/server";
import { z } from "zod";
import { IntakeSchema, anonymiseProfile, buildProfile } from "@/lib/intake";
import { demoRecommend } from "@/lib/demoRecommend";
import { getProductProvider } from "@/lib/providers";
import { isDemoMode } from "@/lib/config";
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
  // The AI pipeline arrives in the next step; until then everything uses the demo ranking.
  const mode = isDemoMode() ? "demo" : "demo-ai-pending";
  const result = await demoRecommend(profile, getProductProvider(), parsed.data.feedback);

  // Anonymised logging. A logging failure must never break the user's results.
  let requestId: string | null = null;
  try {
    const all = [...result.items, ...(result.wildcard ? [result.wildcard] : [])];
    const row = await prisma.recommendationRequest.create({
      data: {
        profileJson: JSON.stringify(anonymiseProfile(profile)),
        promptVersion: "demo-v1",
        mode,
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

  return NextResponse.json({ requestId, mode, ...result });
}
