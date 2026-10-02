/**
 * Anthropic Messages API adapter (raw fetch, no SDK — the same code runs in Deno Edge Functions).
 * Structured output is obtained by forcing a single tool call named `emit` whose `input_schema`
 * is the requested JSON schema; the tool input is the parsed result.
 */
import { z } from 'zod';
import { httpError, postJson } from './http.ts';
import { AiProviderError } from './providerError.ts';
import { extractJson, stripSchemaMeta } from './schema.ts';
import type {
  AiFetch,
  AiLogger,
  AiProvider,
  AiRequest,
  AiResponse,
  AiStopReason,
  AiTier,
} from './types.ts';

export const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_API_VERSION = '2023-06-01';
/** Name of the forced tool used for structured output. */
export const STRUCTURED_OUTPUT_TOOL = 'emit';

/**
 * Claude models from Opus 4.7 onwards (the whole 5 generation included) reject the sampling
 * parameters — `temperature`, `top_p`, `top_k` — with HTTP 400; Haiku 4.5, Sonnet 4.6, Opus 4.6
 * and older still accept them. Prompts keep declaring a temperature; it is only sent where valid.
 */
const MODELS_WITHOUT_SAMPLING = /^claude-(?:(?:opus|sonnet|fable|mythos)-5|opus-4-[78])(?:-|$)/;

export function anthropicSupportsSampling(model: string): boolean {
  return !MODELS_WITHOUT_SAMPLING.test(model);
}
const DEFAULT_TIMEOUT_MS = 60_000;

export interface AnthropicProviderConfig {
  apiKey: string;
  modelSmall: string;
  modelLarge: string;
  fetch: AiFetch;
  /** Override for proxies / tests. */
  messagesUrl?: string;
  timeoutMs?: number;
  logger?: AiLogger;
  now?: () => number;
}

const responseSchema = z.object({
  model: z.string(),
  stop_reason: z.string().nullish(),
  content: z.array(
    z.object({
      type: z.string(),
      text: z.string().optional(),
      name: z.string().optional(),
      input: z.unknown().optional(),
    }),
  ),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    cache_read_input_tokens: z.number().nullish(),
  }),
});

function mapStopReason(reason: string | null | undefined): AiStopReason {
  switch (reason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'end';
    case 'max_tokens':
      return 'max_tokens';
    case 'tool_use':
      return 'tool_use';
    case 'refusal':
      return 'refusal';
    default:
      return 'other';
  }
}

export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic' as const;
  private readonly config: AnthropicProviderConfig;

  constructor(config: AnthropicProviderConfig) {
    this.config = config;
  }

  modelFor(tier: AiTier): string {
    return tier === 'large' ? this.config.modelLarge : this.config.modelSmall;
  }

  buildBody(req: AiRequest): Record<string, unknown> {
    const model = this.modelFor(req.tier);
    const body: Record<string, unknown> = {
      model,
      max_tokens: req.maxOutputTokens,
      system: req.system,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
    };
    if (req.temperature !== undefined && anthropicSupportsSampling(model))
      body.temperature = req.temperature;
    if (req.jsonSchema) {
      body.tools = [
        {
          name: STRUCTURED_OUTPUT_TOOL,
          description:
            'Emit the final structured result. Call exactly once with the complete result.',
          input_schema: stripSchemaMeta(req.jsonSchema),
        },
      ];
      body.tool_choice = { type: 'tool', name: STRUCTURED_OUTPUT_TOOL };
    }
    return body;
  }

  async complete(req: AiRequest): Promise<AiResponse> {
    const now = this.config.now ?? (() => Date.now());
    const started = now();
    const model = this.modelFor(req.tier);
    const result = await postJson({
      fetch: this.config.fetch,
      provider: this.name,
      url: this.config.messagesUrl ?? ANTHROPIC_MESSAGES_URL,
      headers: { 'x-api-key': this.config.apiKey, 'anthropic-version': ANTHROPIC_API_VERSION },
      body: this.buildBody(req),
      timeoutMs: this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });
    const latencyMs = Math.max(0, now() - started);
    if (result.status < 200 || result.status >= 300) {
      const error = httpError(this.name, result, now());
      // Only the fixed `error.type` is logged (e.g. invalid_request_error); the message can quote
      // request fields and must never reach the logs.
      const errorJson = result.json as { error?: { type?: unknown } } | null | undefined;
      this.config.logger?.warn('anthropic request failed', {
        status: result.status,
        purpose: req.metadata.purpose,
        model,
        errorType: typeof errorJson?.error?.type === 'string' ? errorJson.error.type : undefined,
      });
      throw error;
    }
    const parsed = responseSchema.safeParse(result.json);
    if (!parsed.success) {
      throw new AiProviderError(this.name, 'parse', 'Anthropic yanıtı çözümlenemedi.', {
        status: result.status,
      });
    }
    const message = parsed.data;
    const stopReason = mapStopReason(message.stop_reason);
    if (stopReason === 'refusal') {
      throw new AiProviderError(this.name, 'refusal', 'Model bu isteği reddetti.', {
        status: result.status,
      });
    }
    if (stopReason === 'max_tokens' && req.jsonSchema) {
      // The structured reply was cut off: retrying or repairing with the same limit cannot fit it either.
      throw new AiProviderError(this.name, 'parse', 'Yanıt uzunluk sınırında kesildi.', {
        status: result.status,
        retryable: false,
      });
    }
    const textParts: string[] = [];
    let json: unknown;
    for (const block of message.content) {
      if (block.type === 'text' && typeof block.text === 'string') textParts.push(block.text);
      if (block.type === 'tool_use' && block.name === STRUCTURED_OUTPUT_TOOL && json === undefined)
        json = block.input;
    }
    let text = textParts.join('\n').trim();
    if (req.jsonSchema) {
      if (json === undefined) json = extractJson(text);
      if (json === undefined && text.length === 0) {
        throw new AiProviderError(this.name, 'empty', 'Model boş yanıt döndürdü.', {
          status: result.status,
        });
      }
      if (text.length === 0 && json !== undefined) text = JSON.stringify(json);
    } else if (text.length === 0) {
      throw new AiProviderError(this.name, 'empty', 'Model boş yanıt döndürdü.', {
        status: result.status,
      });
    }
    return {
      text,
      ...(json !== undefined ? { json } : {}),
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        ...(typeof message.usage.cache_read_input_tokens === 'number'
          ? { cacheReadInputTokens: message.usage.cache_read_input_tokens }
          : {}),
      },
      model: message.model,
      provider: this.name,
      latencyMs,
      stopReason,
    };
  }
}
