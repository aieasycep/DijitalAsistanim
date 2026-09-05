/**
 * ai — provider-agnostic LLM access for Dijital Asistan.
 *
 *  - `createAiClient`: budget-fitted prompts, zod-validated structured output with one repair
 *    retry, provider fallback, result cache and content-free usage telemetry.
 *  - Prompt builders (`emailDeepAnalysis`, `briefing`, `replyDraft`, …): every system prompt carries
 *    the anti-hallucination rules and every evidence block is redacted and capped per purpose.
 *  - Budget helpers (`assertBudget`), redaction (`redactForPrompt`) and provider error helpers.
 *
 * Web APIs only (fetch, AbortController); configuration is injected — nothing reads env.
 */
export {
  AI_PROVIDER_NAMES,
  AI_PURPOSES,
  AI_TIERS,
  type AiCacheStore,
  type AiFetch,
  type AiJsonSchema,
  type AiLogger,
  type AiMessage,
  type AiProvider,
  type AiProviderName,
  type AiPurpose,
  type AiRequest,
  type AiRequestMetadata,
  type AiResponse,
  type AiStopReason,
  type AiTier,
  type AiUsage,
  type AiUsageRecord,
  type AiUsageSink,
  type PromptSpec,
} from './types';
export {
  DEFAULT_CACHE_TTL_SEC,
  DEFAULT_MAX_OUTPUT_TOKENS,
  aiUnavailableMessage,
  createAiClient,
  repairMessage,
  type AiClient,
  type AiClientConfig,
  type AiProviderCredentials,
  type GenerateOptions,
  type GenerateStructuredResult,
  type GenerateTextResult,
} from './client';
export {
  ANTHROPIC_API_VERSION,
  ANTHROPIC_MESSAGES_URL,
  AnthropicProvider,
  STRUCTURED_OUTPUT_TOOL,
  type AnthropicProviderConfig,
} from './anthropic';
export {
  OPENAI_CHAT_COMPLETIONS_URL,
  OPENAI_STRUCTURED_OUTPUT_NAME,
  OpenAIProvider,
  openAiSupportsTemperature,
  type OpenAIProviderConfig,
} from './openai';
export {
  AiProviderError,
  isAiProviderError,
  parseRetryAfterSec,
  type AiProviderErrorKind,
} from './providerError';
export {
  httpError,
  postJson,
  providerErrorMessage,
  type JsonPostInput,
  type JsonPostResult,
} from './http';
export {
  extractJson,
  formatZodIssues,
  isOpenAiStrictCompatible,
  jsonSchemaFor,
  stripSchemaMeta,
} from './schema';
export {
  CONTEXT_CLOSE_TAG,
  CONTEXT_OPEN_TAG,
  composeUserMessage,
  fitPromptToBudget,
  truncateContext,
  truncationMarker,
  type FitPromptInput,
  type FitPromptOptions,
  type FitPromptResult,
} from './inputBudget';
export {
  DEFAULT_BUDGET_TIMEZONE,
  assertBudget,
  budgetExceededMessage,
  budgetLimitFor,
  budgetStatus,
  nextBudgetReset,
  type AiBudgetStatus,
  type AiDailyTokenLimits,
  type AssertBudgetInput,
} from './budget';
export {
  PROMPT_CHAR_LIMITS,
  redactForPrompt,
  shortenUrls,
  stripDisclaimers,
  stripSignature,
  type RedactOptions,
} from './redact';
export * from './prompts';
