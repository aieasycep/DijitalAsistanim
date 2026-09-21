/**
 * Input token budget: instructions are never cut; only the `context` (evidence) block is
 * truncated until the estimated prompt fits `maxInputTokens`.
 */
import type { Locale } from '@da/domain';
import { AppError } from '../errors';
import { estimateTokens } from '../util';

export const CONTEXT_OPEN_TAG = '<kaynaklar>';
export const CONTEXT_CLOSE_TAG = '</kaynaklar>';
/** Tokens reserved for message framing / role markers. */
const FRAMING_TOKENS = 24;

export interface FitPromptInput {
  system: string;
  user: string;
  context?: string;
}

export interface FitPromptOptions {
  maxInputTokens: number;
  /** Tokens consumed by the JSON schema sent alongside the prompt. */
  schemaTokens?: number;
  locale?: Locale;
}

export interface FitPromptResult {
  userMessage: string;
  estimatedInputTokens: number;
  truncated: boolean;
  /** Characters of context kept after fitting. */
  contextChars: number;
}

export function truncationMarker(locale: Locale = 'tr'): string {
  return locale === 'en'
    ? '[… source text shortened to fit the limit]'
    : '[… kaynak metni sınır nedeniyle kısaltıldı]';
}

export function composeUserMessage(user: string, context?: string): string {
  const instructions = user.trim();
  const evidence = context?.trim() ?? '';
  if (!evidence) return instructions;
  return `${instructions}\n\n${CONTEXT_OPEN_TAG}\n${evidence}\n${CONTEXT_CLOSE_TAG}`;
}

/** Cut `text` to at most `maxChars`, preferring a line boundary, and append the marker. */
export function truncateContext(text: string, maxChars: number, locale: Locale = 'tr'): string {
  const marker = truncationMarker(locale);
  if (maxChars <= marker.length + 8) return marker;
  const room = maxChars - marker.length - 1;
  if (text.length <= room) return text;
  let cut = text.slice(0, room);
  const lastBreak = cut.lastIndexOf('\n');
  if (lastBreak > room * 0.6) cut = cut.slice(0, lastBreak);
  return `${cut.trimEnd()}\n${marker}`;
}

export function fitPromptToBudget(input: FitPromptInput, opts: FitPromptOptions): FitPromptResult {
  const locale = opts.locale ?? 'tr';
  const fixedTokens =
    estimateTokens(input.system) +
    estimateTokens(input.user) +
    (opts.schemaTokens ?? 0) +
    FRAMING_TOKENS;
  if (fixedTokens > opts.maxInputTokens) {
    throw new AppError(
      'validation',
      locale === 'en' ? 'The request is too long.' : 'İstek çok uzun.',
      {
        details: {
          estimatedInputTokens: fixedTokens,
          maxInputTokens: opts.maxInputTokens,
          reason: 'instructions_exceed_budget',
        },
      },
    );
  }
  const context = input.context?.trim() ?? '';
  if (!context) {
    return {
      userMessage: composeUserMessage(input.user),
      estimatedInputTokens: fixedTokens,
      truncated: false,
      contextChars: 0,
    };
  }
  const tagTokens = estimateTokens(CONTEXT_OPEN_TAG) + estimateTokens(CONTEXT_CLOSE_TAG) + 2;
  const available = opts.maxInputTokens - fixedTokens - tagTokens;
  const contextTokens = estimateTokens(context);
  if (contextTokens <= available) {
    return {
      userMessage: composeUserMessage(input.user, context),
      estimatedInputTokens: fixedTokens + tagTokens + contextTokens,
      truncated: false,
      contextChars: context.length,
    };
  }
  const allowedChars = Math.max(0, available * 4);
  const shortened = truncateContext(context, allowedChars, locale);
  return {
    userMessage: composeUserMessage(input.user, shortened),
    estimatedInputTokens: fixedTokens + tagTokens + estimateTokens(shortened),
    truncated: true,
    contextChars: shortened.length,
  };
}
