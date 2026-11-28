import { z } from "zod";

/** Options shown in the questionnaire. */
export const RELATIONSHIPS = ["partner", "parent", "sibling", "child", "grandparent", "friend", "colleague", "other"] as const;
export const AGE_RANGES = ["0-4", "5-12", "13-17", "18-25", "26-40", "41-60", "60+"] as const;
export const GENDERS = ["female", "male", "other"] as const;
export const COUNTRIES = ["NL", "BE"] as const;
export const OCCASIONS = ["birthday", "christmas", "sinterklaas", "anniversary", "valentines", "thank-you", "secret-santa", "graduation", "housewarming", "just-because"] as const;

export const INTEREST_TAGS = [
  "coffee", "tea", "cooking", "baking", "wine", "cocktails", "beer",
  "padel", "running", "cycling", "yoga", "gym", "swimming", "hiking", "camping",
  "travel", "reading", "music", "vinyl", "gaming", "board games", "puzzle",
  "photography", "tech", "smart home", "diy", "gardening", "plants",
  "art", "drawing", "crafts", "lego", "self care", "sleep", "skincare",
  "fashion", "design", "history", "science", "space",
] as const;

/** Very common gifts people often already have; offered as one-tap "avoid" chips. */
export const GENERIC_GIFTS = ["AirPods", "gift card", "candle", "socks", "mug", "perfume", "power bank", "bluetooth speaker", "wine", "headphones"] as const;

const Slider = z.number().int().min(0).max(100);

export const IntakeSchema = z
  .object({
    relationship: z.enum(RELATIONSHIPS),
    ageRange: z.enum(AGE_RANGES),
    gender: z.enum(GENDERS).optional(),
    country: z.enum(COUNTRIES),
    occasion: z.enum(OCCASIONS),
    /** YYYY-MM-DD */
    neededBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
    /** Optional floor; the questionnaire sends 0. The budget is a cap, not a target. */
    budgetMinEur: z.number().min(0).max(100000).default(0),
    budgetMaxEur: z.number().min(1).max(100000),
    interestTags: z.array(z.string().min(1).max(40)).max(20),
    /** e.g. "into padel lately, drinks black coffee, hates clutter" */
    interestText: z.string().max(500),
    style: z.object({
      /** 0 = practical, 100 = sentimental */
      practicalSentimental: Slider,
      /** 0 = experience, 100 = physical object */
      experienceObject: Slider,
      /** 0 = classic, 100 = trendy */
      classicTrendy: Slider,
    }),
    avoid: z.array(z.string().min(1).max(60)).max(30),
    allowClothing: z.boolean(),
    sizes: z
      .object({ top: z.string().max(10).optional(), bottom: z.string().max(10).optional(), shoe: z.string().max(10).optional() })
      .optional(),
  })
  .refine((v) => v.budgetMinEur <= v.budgetMaxEur, {
    message: "Minimum budget must be lower than the maximum",
    path: ["budgetMaxEur"],
  })
  .refine((v) => v.interestTags.length > 0 || v.interestText.trim().length > 0, {
    message: "Pick at least one interest or describe them",
    path: ["interestTags"],
  });

export type Intake = z.infer<typeof IntakeSchema>;

const STOPWORDS = new Set(
  "a an and are as at be but by for from has have he her him his i in into is it its just lately like likes love loves me my not of on or our she so the their them they this to too very was we with you your really always never drinks drink hates hate likes enjoys enjoy lot lots fan favorite favourite big huge".split(" "),
);

/** Words (and two-word phrases like "black coffee") from the free text worth searching for. */
export function extractKeywords(text: string): string[] {
  const out: string[] = [];
  for (const chunk of text.toLowerCase().split(/[,.;:!?\n]+/)) {
    const words = chunk.split(/[^\p{L}\p{N}-]+/u).filter((w) => w.length >= 3 && !STOPWORDS.has(w));
    for (let i = 0; i < words.length; i++) {
      if (i > 0) out.push(`${words[i - 1]} ${words[i]}`);
      out.push(words[i]);
    }
  }
  return [...new Set(out)];
}

/**
 * Structured recipient profile used by the pipeline. Contains no names.
 * `freeText` stays in memory for this request only and is never logged.
 */
export interface RecipientProfile {
  relationship: Intake["relationship"];
  ageRange: Intake["ageRange"];
  gender?: Intake["gender"];
  country: Intake["country"];
  occasion: Intake["occasion"];
  neededBy: string;
  budget: { minEur: number; maxEur: number };
  interestTags: string[];
  /** Search words from the tags and the free text. */
  keywords: string[];
  freeText: string;
  style: Intake["style"];
  avoid: string[];
  allowClothing: boolean;
}

export function buildProfile(intake: Intake): RecipientProfile {
  const tags = intake.interestTags.map((t) => t.toLowerCase().trim());
  return {
    relationship: intake.relationship,
    ageRange: intake.ageRange,
    gender: intake.gender,
    country: intake.country,
    occasion: intake.occasion,
    neededBy: intake.neededBy,
    budget: { minEur: intake.budgetMinEur, maxEur: intake.budgetMaxEur },
    interestTags: tags,
    keywords: [...new Set([...tags, ...extractKeywords(intake.interestText)])],
    freeText: intake.interestText.trim(),
    style: intake.style,
    avoid: intake.avoid.map((a) => a.trim()).filter(Boolean),
    allowClothing: intake.allowClothing,
  };
}

/** What may be stored in the database: no free text, no avoid list. */
export function anonymiseProfile(p: RecipientProfile) {
  return {
    relationship: p.relationship,
    ageRange: p.ageRange,
    country: p.country,
    occasion: p.occasion,
    budget: p.budget,
    interestTags: p.interestTags,
    style: p.style,
    allowClothing: p.allowClothing,
    hasFreeText: p.freeText.length > 0,
    avoidCount: p.avoid.length,
  };
}
