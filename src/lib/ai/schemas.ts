import { z } from "zod";
import { CATEGORIES } from "@/lib/types";

export const ConceptSchema = z.object({
  title: z.string(),
  category: z.enum(CATEGORIES),
  whyItFits: z.string(),
  priceMinEur: z.number(),
  priceMaxEur: z.number(),
  searchKeywords: z.array(z.string()),
});
export const ConceptsSchema = z.object({ concepts: z.array(ConceptSchema) });
export type Concept = z.infer<typeof ConceptSchema>;

export const PickSchema = z.object({
  productId: z.string(),
  fitScore: z.number(),
  reason: z.string(),
});
export const RerankSchema = z.object({
  picks: z.array(PickSchema),
  wildcard: z.object({ productId: z.string(), reason: z.string() }).nullable(),
});
export type RerankOutput = z.infer<typeof RerankSchema>;
