# Prompts

LLM prompts live here as versioned files, never as inline strings in code.

| File | Step | Model (env) |
| --- | --- | --- |
| `concepts.v2.md` (current) | Generate ~24 diverse gift concepts; budget is a cap, no generic filler | `ANTHROPIC_MODEL_CONCEPTS` |
| `rerank.v2.md` (current) | Pick the best real products + write reasons; price is not a quality signal | `ANTHROPIC_MODEL_RERANK` |
| `*.v1.md` | First versions, kept for comparison | |

To try a new version, copy the file (e.g. `rerank.v2.md`), change `PROMPT_VERSIONS` in
`src/lib/ai/prompts.ts`, and compare with the `/eval` script. The version is stored with
every logged request.
