/**
 * OpenAI Chat Completions adapter (raw fetch). Structured output uses
 * `response_format: { type: 'json_schema' }` — strict mode only when the schema is compatible
 * with OpenAI's strict subset (all properties required, no validation keywords).
 */
import { z } from 'zod';
import { httpError, postJson } from './http';
import { AiProviderError } from './providerError';
import { extractJson, isOpenAiStrictCompatible, stripSchemaMeta } from './schema';
import type { AiFetch, AiLogger, AiProvider, AiRequest, AiResponse, AiStopReason, AiTier } from './types';

export const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';
export const OPENAI_STRUCTURED_OUTPUT_NAME = 'emit';
const DEFAULT_TIMEOUT_MS = 60_000;

export interface OpenAIProviderConfig {
  apiKey: string;
  modelSmall: string;
  modelLarge: string;
  fetch: AiFetch;
  chatCompletionsUrl?: string;
  timeoutMs?: number;
  logger?: AiLogger;
  now?: () => number;
  /** Optional org / project headers. */
  organization?: string;
  project?: string;
}

const responseSchema = z.object({
  model: z.string(),
  choices: z.array(
    z.object({
      finish_reason: z.string().nullish(),
      message: z.object({
        content: z.string().nullish(),
        refusal: z.string().nullish(),
      }),
    }),
  ),
  usage: z
    .object({
      prompt_tokens: z.number(),
      completion_tokens: z.number(),
      prompt_tokens_details: z.object({ cached_tokens: z.number().nullish() }).nullish(),
    })
    .nullish(),
});

/** Reasoning models reject sampling parameters other than the default. */
export function openAiSupportsTemperature(model: string): boolean {
  return !/^(o\d|gpt-5)/i.test(model);
}

function mapFinishReason(reason: string | null | undefined): AiStopReason {
  switch (reason) {
    case 'stop':
      return 'end';
    case 'length':
      return 'max_tokens';
    case 'tool_calls':
    case 'function_call':
      return 'tool_use';
    case 'content_filter':
      return 'refusal';
    default:
      return 'other';
  }
}

export class OpenAIProvider implements AiProvider {
  readonly name = 'openai' as const;
  private readonly config: OpenAIProviderConfig;

  constructor(config: OpenAIProviderConfig) {
    this.config = config;
  }

  modelFor(tier: AiTier): string {
    return tier === 'large' ? this.config.modelLarge : this.config.modelSmall;
  }

  buildBody(req: AiRequest): Record<string, unknown> {
    const model = this.modelFor(req.tier);
    const body: Record<string, unknown> = {
      model,
      messages: [{ role: 'system', content: req.system }, ...req.messages.map((m) => ({ role: m.role, content: m.content }))],
      max_completion_tokens: req.maxOutputTokens,
    };
    if (req.temperature !== undefined && openAiSupportsTemperature(model)) body.temperature = req.temperature;
    if (req.jsonSchema) {
      const schema = stripSchemaMeta(req.jsonSchema);
      body.response_format = {
        type: 'json_schema',
        json_schema: { name: OPENAI_STRUCTURED_OUTPUT_NAME, schema, strict: isOpenAiStrictCompatible(schema) },
      };
    }
    return body;
  }

  async complete(req: AiRequest): Promise<AiResponse> {
    const now = this.config.now ?? (() => Date.now());
    const started = now();
    const headers: Record<string, string> = { authorization: `Bearer ${this.config.apiKey}` };
    if (this.config.organization) headers['openai-organization'] = this.config.organization;
    if (this.config.project) headers['openai-project'] = this.config.project;
    const result = await postJson({
      fetch: this.config.fetch,
      provider: this.name,
      url: this.config.chatCompletionsUrl ?? OPENAI_CHAT_COMPLETIONS_URL,
      headers,
      body: this.buildBody(req),
      timeoutMs: this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });
    const latencyMs = Math.max(0, now() - started);
    if (result.status < 200 || result.status >= 300) {
      this.config.logger?.warn('openai request failed', { status: result.status, purpose: req.metadata.purpose });
      throw httpError(this.name, result, now());
    }
    const parsed = responseSchema.safeParse(result.json);
    if (!parsed.success) {
      throw new AiProviderError(this.name, 'parse', 'OpenAI yanıtı çözümlenemedi.', { status: result.status });
    }
    const choice = parsed.data.choices[0];
    if (!choice) throw new AiProviderError(this.name, 'empty', 'Model boş yanıt döndürdü.', { status: result.status });
    const stopReason = mapFinishReason(choice.finish_reason);
    if (stopReason === 'refusal' || (choice.message.refusal && !choice.message.content)) {
      throw new AiProviderError(this.name, 'refusal', 'Model bu isteği reddetti.', { status: result.status });
    }
    const text = (choice.message.content ?? '').trim();
    if (!text) throw new AiProviderError(this.name, 'empty', 'Model boş yanıt döndürdü.', { status: result.status });
    const json = req.jsonSchema ? extractJson(text) : undefined;
    const usage = parsed.data.usage;
    const cached = usage?.prompt_tokens_details?.cached_tokens;
    return {
      text,
      ...(json !== undefined ? { json } : {}),
      usage: {
        inputTokens: usage?.prompt_tokens ?? 0,
        outputTokens: usage?.completion_tokens ?? 0,
        ...(typeof cached === 'number' ? { cacheReadInputTokens: cached } : {}),
      },
      model: parsed.data.model,
      provider: this.name,
      latencyMs,
      stopReason,
    };
  }
}
