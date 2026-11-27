import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Prompt versions in use. Bump when a new file is added in /prompts. */
export const PROMPT_VERSIONS = { concepts: "concepts.v1", rerank: "rerank.v1" } as const;

const cache = new Map<string, string>();

/** Loads /prompts/<name>.md. Prompts live in files, never inline in code. */
export function loadPrompt(name: string): string {
  if (!/^[a-z0-9.-]+$/.test(name)) throw new Error(`Invalid prompt name: ${name}`);
  let text = cache.get(name);
  if (text === undefined) {
    text = readFileSync(join(process.cwd(), "prompts", `${name}.md`), "utf8");
    cache.set(name, text);
  }
  return text;
}

/** Fills {{placeholders}}. Throws if one is missing so typos never reach the model. */
export function renderPrompt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (!(key in vars)) throw new Error(`Missing prompt variable: ${key}`);
    return String(vars[key]);
  });
}
