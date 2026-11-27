"use client";

import type { ReactNode } from "react";

export function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-full border px-4 py-2 text-sm transition ${
        selected
          ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
          : "border-neutral-300 hover:border-neutral-500 dark:border-neutral-700"
      }`}
    >
      {children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-medium">{label}</span>
      {hint && <span className="-mt-1 text-sm text-neutral-500">{hint}</span>}
      {children}
    </div>
  );
}

export function StyleSlider({
  left,
  right,
  value,
  onChange,
}: {
  left: string;
  right: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`${left} to ${right}`}
        className="w-full accent-neutral-900 dark:accent-white"
      />
      <div className="flex justify-between text-sm text-neutral-500">
        <span>{left}</span>
        <span>{right}</span>
      </div>
    </div>
  );
}

export const inputClass =
  "w-full rounded-xl border border-neutral-300 bg-transparent px-4 py-3 text-base outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-white";
