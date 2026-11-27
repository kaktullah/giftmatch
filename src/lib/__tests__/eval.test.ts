import { describe, expect, it } from "vitest";
import personas from "../../../eval/personas.json";
import { IntakeSchema } from "@/lib/intake";

describe("eval personas", () => {
  it("has 15 valid, uniquely named personas", () => {
    expect(personas).toHaveLength(15);
    expect(new Set(personas.map((p) => p.id)).size).toBe(15);
    for (const p of personas) {
      const r = IntakeSchema.safeParse({ ...p.intake, neededBy: "2026-12-31" });
      expect(r.success, p.id).toBe(true);
    }
  });
});
