import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

export interface Usage {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface GenerateOptions<S extends z.ZodType> {
  model: string;
  prompt: string;
  schema: S;
  maxTokens?: number;
}

/** Anything that can turn a prompt into schema-validated JSON. Swappable in tests. */
export interface LlmClient {
  generate<S extends z.ZodType>(opts: GenerateOptions<S>): Promise<{ data: z.infer<S>; usage: Usage }>;
}

export class LlmOutputError extends Error {}

/** Calls Claude with structured outputs so the reply always matches the Zod schema. */
export class AnthropicLlm implements LlmClient {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 1, timeout: 60_000 });
  }

  async generate<S extends z.ZodType>({ model, prompt, schema, maxTokens = 8000 }: GenerateOptions<S>) {
    const response = await this.client.messages.parse({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
      // Low effort keeps each recommendation cheap (target < €0.02).
      output_config: { effort: "low", format: zodOutputFormat(schema) },
    });
    const usage: Usage = {
      model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
    if (response.stop_reason === "refusal") throw new LlmOutputError("Model declined the request");
    if (response.stop_reason === "max_tokens") throw new LlmOutputError("Model output was cut off");
    const parsed = schema.safeParse(response.parsed_output);
    if (!parsed.success) throw new LlmOutputError("Model output did not match the schema");
    return { data: parsed.data as z.infer<S>, usage };
  }
}

/**
 * Runs an LLM step, retrying once on failure. Usage from failed attempts is
 * still reported so costs are logged honestly.
 */
export async function generateWithRetry<S extends z.ZodType>(
  llm: LlmClient,
  opts: GenerateOptions<S>,
  usageLog: Usage[],
): Promise<z.infer<S>> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data, usage } = await llm.generate(opts);
      usageLog.push(usage);
      return data;
    } catch (err) {
      lastError = err;
      // A bad key or bad request will not fix itself; only retry output problems,
      // rate limits and server errors.
      const status = err instanceof Anthropic.APIError ? err.status : undefined;
      if (status !== undefined && status >= 400 && status < 500 && status !== 429) break;
    }
  }
  throw lastError;
}
