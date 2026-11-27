# Prompts

LLM prompts live here as versioned files, never as inline strings in code.

| File | Step | Model (env) |
| --- | --- | --- |
| `concepts.v1.md` | Generate ~24 diverse gift concepts | `ANTHROPIC_MODEL_CONCEPTS` |
| `rerank.v1.md` | Pick the best real products + write reasons | `ANTHROPIC_MODEL_RERANK` |

To try a new version, copy the file (e.g. `rerank.v2.md`), change `PROMPT_VERSIONS` in
`src/lib/ai/prompts.ts`, and compare with the `/eval` script. The version is stored with
every logged request.
