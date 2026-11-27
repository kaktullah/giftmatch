import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const FeedbackSchema = z.object({
  requestId: z.string().min(1),
  productId: z.string().min(1),
  type: z.enum(["click", "more_like_this", "not_this"]),
});

/** Records clicks and "more like this" / "not this" so quality can be measured. */
export async function POST(req: Request) {
  const parsed = FeedbackSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  if (process.env.DATABASE_URL) try {
    await prisma.feedbackEvent.create({ data: parsed.data });
  } catch (err) {
    console.warn("[feedback] logging failed", err);
  }
  return NextResponse.json({ ok: true });
}
