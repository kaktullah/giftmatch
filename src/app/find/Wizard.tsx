"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AGE_RANGES,
  COUNTRIES,
  GENDERS,
  GENERIC_GIFTS,
  INTEREST_TAGS,
  IntakeSchema,
  OCCASIONS,
  RELATIONSHIPS,
  type Intake,
} from "@/lib/intake";
import type { RecommendResult } from "@/lib/demoRecommend";
import { Chip, Field, StyleSlider, inputClass } from "@/components/ui";
import { COUNTRY_LABELS, GENDER_LABELS, OCCASION_LABELS, RELATIONSHIP_LABELS } from "./labels";
import { Results } from "./Results";

type Draft = Omit<Intake, "relationship" | "ageRange" | "occasion"> & {
  relationship?: Intake["relationship"];
  ageRange?: Intake["ageRange"];
  occasion?: Intake["occasion"];
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const today = new Date();
const initialDraft: Draft = {
  country: "NL",
  neededBy: isoDate(new Date(today.getTime() + 7 * 86400000)),
  budgetMinEur: 0,
  budgetMaxEur: 50,
  interestTags: [],
  interestText: "",
  style: { practicalSentimental: 50, experienceObject: 50, classicTrendy: 50 },
  avoid: [],
  allowClothing: false,
};

const BUDGET_PRESETS = [20, 50, 100, 250, 500, 1000];

const STEPS = ["Who", "When", "Budget", "Interests", "Style", "Avoid"] as const;

export type ApiResult = RecommendResult & { requestId: string | null; mode: string };

export function Wizard() {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [avoidInput, setAvoidInput] = useState("");
  /** Raw text of the budget box, so typing (or clearing) never jumps around. */
  const [budgetText, setBudgetText] = useState(String(initialDraft.budgetMaxEur));
  const [minBudgetText, setMinBudgetText] = useState("");
  const toggleAvoid = (item: string) =>
    set("avoid", draft.avoid.includes(item) ? draft.avoid.filter((a) => a !== item) : [...draft.avoid, item]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [intake, setIntake] = useState<Intake | null>(null);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const toggleTag = (tag: string) =>
    set("interestTags", draft.interestTags.includes(tag) ? draft.interestTags.filter((t) => t !== tag) : [...draft.interestTags, tag]);
  const addAvoid = () => {
    const items = avoidInput.split(",").map((s) => s.trim()).filter(Boolean);
    if (items.length) set("avoid", [...new Set([...draft.avoid, ...items])]);
    setAvoidInput("");
  };

  /** Checks only what the current step asks for. */
  function stepError(): string | null {
    switch (STEPS[step]) {
      case "Who":
        if (!draft.relationship) return "Who is the gift for?";
        if (!draft.ageRange) return "Pick an age range.";
        return null;
      case "When":
        if (!draft.occasion) return "Pick an occasion.";
        if (!draft.neededBy || draft.neededBy < isoDate(new Date())) return "Pick a date from today onwards.";
        return null;
      case "Budget":
        if (!Number.isFinite(draft.budgetMaxEur) || draft.budgetMaxEur < 1) return "Enter a budget of at least €1.";
        if (draft.budgetMaxEur > 100000) return "That's a very big budget. Please enter €100,000 or less.";
        if (draft.budgetMinEur > draft.budgetMaxEur) return "The minimum can't be higher than the maximum.";
        return null;
      case "Interests":
        if (draft.interestTags.length === 0 && !draft.interestText.trim()) return "Pick at least one interest or describe them.";
        return null;
      default:
        return null;
    }
  }

  async function fetchResults(input: Intake, feedback = { liked: [] as string[], disliked: [] as string[] }) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intake: input, feedback }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setResult((await res.json()) as ApiResult);
    } catch {
      setError("Something went wrong while finding gifts. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function next() {
    const err = stepError();
    if (err) return setError(err);
    setError(null);
    if (step < STEPS.length - 1) return setStep(step + 1);

    const pendingAvoid = avoidInput.split(",").map((s) => s.trim()).filter(Boolean);
    const parsed = IntakeSchema.safeParse({ ...draft, avoid: [...new Set([...draft.avoid, ...pendingAvoid])] });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Please check your answers.");
    setIntake(parsed.data);
    await fetchResults(parsed.data);
  }

  if (result && intake) {
    return (
      <Results
        result={result}
        loading={loading}
        onFeedback={(feedback) => fetchResults(intake, feedback)}
        onRestart={() => {
          setResult(null);
          setStep(0);
        }}
      />
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-3">
        <Link href="/" className="text-sm font-semibold tracking-tight">GiftMatch</Link>
        <div className="flex gap-1" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-neutral-900 dark:bg-white" : "bg-neutral-200 dark:bg-neutral-800"}`} />
          ))}
        </div>
        <p className="text-sm text-neutral-500">Step {step + 1} of {STEPS.length}</p>
      </header>

      <section className="flex flex-1 flex-col gap-6">
        {STEPS[step] === "Who" && (
          <>
            <h1 className="text-2xl font-bold">Who is the gift for?</h1>
            <Field label="Relationship">
              <div className="flex flex-wrap gap-2">
                {RELATIONSHIPS.map((r) => (
                  <Chip key={r} selected={draft.relationship === r} onClick={() => set("relationship", r)}>{RELATIONSHIP_LABELS[r]}</Chip>
                ))}
              </div>
            </Field>
            <Field label="Age">
              <div className="flex flex-wrap gap-2">
                {AGE_RANGES.map((a) => (
                  <Chip key={a} selected={draft.ageRange === a} onClick={() => set("ageRange", a)}>{a}</Chip>
                ))}
              </div>
            </Field>
            <Field label="Gender" hint="Optional">
              <div className="flex flex-wrap gap-2">
                {GENDERS.map((g) => (
                  <Chip key={g} selected={draft.gender === g} onClick={() => set("gender", draft.gender === g ? undefined : g)}>{GENDER_LABELS[g]}</Chip>
                ))}
              </div>
            </Field>
            <Field label="Where do they live?" hint="For shipping">
              <div className="flex flex-wrap gap-2">
                {COUNTRIES.map((c) => (
                  <Chip key={c} selected={draft.country === c} onClick={() => set("country", c)}>{COUNTRY_LABELS[c]}</Chip>
                ))}
              </div>
            </Field>
          </>
        )}

        {STEPS[step] === "When" && (
          <>
            <h1 className="text-2xl font-bold">What&apos;s the occasion?</h1>
            <div className="flex flex-wrap gap-2">
              {OCCASIONS.map((o) => (
                <Chip key={o} selected={draft.occasion === o} onClick={() => set("occasion", o)}>{OCCASION_LABELS[o]}</Chip>
              ))}
            </div>
            <Field label="When do you need it?" hint="We only show gifts that arrive in time.">
              <input type="date" className={inputClass} min={isoDate(new Date())} value={draft.neededBy} onChange={(e) => set("neededBy", e.target.value)} />
            </Field>
          </>
        )}

        {STEPS[step] === "Budget" && (
          <>
            <h1 className="text-2xl font-bold">What&apos;s your budget?</h1>
            <p className="-mt-3 text-sm text-neutral-500">We pick the best fit within your range, not the most expensive.</p>
            <div className="flex flex-wrap gap-2">
              {BUDGET_PRESETS.map((max) => (
                <Chip
                  key={max}
                  selected={draft.budgetMaxEur === max}
                  onClick={() => {
                    set("budgetMaxEur", max);
                    setBudgetText(String(max));
                  }}
                >
                  Up to €{max.toLocaleString("en")}
                </Chip>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="From (€)" hint="Optional">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  className={inputClass}
                  value={minBudgetText}
                  onChange={(e) => {
                    const text = e.target.value.replace(/[^0-9]/g, "").slice(0, 6);
                    setMinBudgetText(text);
                    set("budgetMinEur", text === "" ? 0 : Number(text));
                  }}
                />
              </Field>
              <Field label="Up to (€)" hint="Your maximum">
                <input
                  type="text"
                  inputMode="numeric"
                  className={inputClass}
                  value={budgetText}
                  onChange={(e) => {
                    const text = e.target.value.replace(/[^0-9]/g, "").slice(0, 6);
                    setBudgetText(text);
                    set("budgetMaxEur", text === "" ? 0 : Number(text));
                  }}
                />
              </Field>
            </div>
          </>
        )}

        {STEPS[step] === "Interests" && (
          <>
            <h1 className="text-2xl font-bold">What are they into?</h1>
            <div className="flex flex-wrap gap-2">
              {INTEREST_TAGS.map((t) => (
                <Chip key={t} selected={draft.interestTags.includes(t)} onClick={() => toggleTag(t)}>{t}</Chip>
              ))}
            </div>
            <Field label="Tell us more" hint="The more specific, the better. No names needed.">
              <textarea
                rows={3}
                maxLength={500}
                className={inputClass}
                placeholder="e.g. into padel lately, drinks black coffee, hates clutter"
                value={draft.interestText}
                onChange={(e) => set("interestText", e.target.value)}
              />
            </Field>
          </>
        )}

        {STEPS[step] === "Style" && (
          <>
            <h1 className="text-2xl font-bold">What kind of gift?</h1>
            <StyleSlider left="Practical" right="Sentimental" value={draft.style.practicalSentimental} onChange={(v) => set("style", { ...draft.style, practicalSentimental: v })} />
            <StyleSlider left="Experience" right="Something to keep" value={draft.style.experienceObject} onChange={(v) => set("style", { ...draft.style, experienceObject: v })} />
            <StyleSlider left="Classic" right="Trendy" value={draft.style.classicTrendy} onChange={(v) => set("style", { ...draft.style, classicTrendy: v })} />
          </>
        )}

        {STEPS[step] === "Avoid" && (
          <>
            <h1 className="text-2xl font-bold">Anything to avoid?</h1>
            <Field label="Skip the usual suspects?" hint="Tap the common gifts they probably already have.">
              <div className="flex flex-wrap gap-2">
                {GENERIC_GIFTS.map((g) => (
                  <Chip key={g} selected={draft.avoid.includes(g)} onClick={() => toggleAvoid(g)}>{g}</Chip>
                ))}
              </div>
            </Field>
            <Field label="Anything else they own or don't want" hint="Separate with commas, e.g. AeroPress, alcohol">
              <div className="flex gap-2">
                <input
                  className={inputClass}
                  value={avoidInput}
                  onChange={(e) => setAvoidInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addAvoid();
                    }
                  }}
                />
                <button type="button" onClick={addAvoid} className="rounded-xl border border-neutral-300 px-4 dark:border-neutral-700">Add</button>
              </div>
              {draft.avoid.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {draft.avoid.filter((a) => !(GENERIC_GIFTS as readonly string[]).includes(a)).map((a) => (
                    <Chip key={a} selected onClick={() => set("avoid", draft.avoid.filter((x) => x !== a))}>{a} ✕</Chip>
                  ))}
                </div>
              )}
            </Field>
            <label className="flex items-center gap-3">
              <input type="checkbox" className="h-5 w-5" checked={draft.allowClothing} onChange={(e) => set("allowClothing", e.target.checked)} />
              <span>Clothing is OK</span>
            </label>
            {draft.allowClothing && (
              <div className="grid grid-cols-3 gap-3">
                {(["top", "bottom", "shoe"] as const).map((k) => (
                  <Field key={k} label={k === "top" ? "Top" : k === "bottom" ? "Trousers" : "Shoe"} hint="Optional">
                    <input
                      className={inputClass}
                      maxLength={10}
                      value={draft.sizes?.[k] ?? ""}
                      onChange={(e) => set("sizes", { ...draft.sizes, [k]: e.target.value || undefined })}
                    />
                  </Field>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <footer className="sticky bottom-0 flex gap-3 bg-[var(--background)] py-4">
        {step > 0 && (
          <button type="button" onClick={() => { setError(null); setStep(step - 1); }} className="rounded-full border border-neutral-300 px-6 py-3 dark:border-neutral-700">
            Back
          </button>
        )}
        <button
          type="button"
          onClick={next}
          disabled={loading}
          className="flex-1 rounded-full bg-neutral-900 px-6 py-3 font-medium text-white disabled:opacity-60 dark:bg-white dark:text-neutral-900"
        >
          {loading ? "Finding gifts…" : step === STEPS.length - 1 ? "Show gift ideas" : "Next"}
        </button>
      </footer>
    </main>
  );
}
