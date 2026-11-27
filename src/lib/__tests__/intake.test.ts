import { describe, expect, it } from "vitest";
import { IntakeSchema, anonymiseProfile, buildProfile, extractKeywords } from "@/lib/intake";
import { sampleIntake } from "./fixtures";


describe("IntakeSchema", () => {
  it("accepts a complete questionnaire", () => {
    expect(IntakeSchema.safeParse(sampleIntake).success).toBe(true);
  });

  it("rejects min budget above max", () => {
    const r = IntakeSchema.safeParse({ ...sampleIntake, budgetMinEur: 100, budgetMaxEur: 50 });
    expect(r.success).toBe(false);
  });

  it("needs at least one interest", () => {
    const r = IntakeSchema.safeParse({ ...sampleIntake, interestTags: [], interestText: "  " });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid date and unknown options", () => {
    expect(IntakeSchema.safeParse({ ...sampleIntake, neededBy: "next week" }).success).toBe(false);
    expect(IntakeSchema.safeParse({ ...sampleIntake, relationship: "boss" }).success).toBe(false);
  });
});

describe("extractKeywords", () => {
  it("keeps meaningful words and drops filler", () => {
    expect(extractKeywords("Into padel lately, drinks black coffee")).toEqual(["padel", "black", "black coffee", "coffee"]);
  });
});

describe("buildProfile", () => {
  it("merges tags and free-text words, lowercased and unique", () => {
    const p = buildProfile(sampleIntake);
    expect(p.keywords).toContain("padel");
    expect(p.keywords).toContain("coffee");
    expect(p.keywords.filter((k) => k === "padel")).toHaveLength(1);
    expect(p.budget).toEqual({ minEur: 20, maxEur: 60 });
  });

  it("anonymised version contains no free text or avoid list", () => {
    const anon = JSON.stringify(anonymiseProfile(buildProfile(sampleIntake)));
    expect(anon).not.toContain("black coffee");
    expect(anon).not.toContain("candles");
  });
});
