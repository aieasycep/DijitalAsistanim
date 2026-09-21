/** Per-user daily AI token budget (AI_DAILY_TOKEN_BUDGET_FREE / _PRO). */
import type { Locale, Plan } from '@da/domain';
import { AppError } from '../errors';
import { addDays, localDateKey, zonedTimeToUtc } from '../util';

export interface AiDailyTokenLimits {
  free: number;
  pro: number;
}

export interface AssertBudgetInput {
  plan: Plan;
  /** Tokens (input + output) already consumed today in the user's timezone. */
  usedToday: number;
  limits: AiDailyTokenLimits;
  /** Estimated tokens of the call about to be made (optional pre-check). */
  requested?: number;
  locale?: Locale;
  /** Used to compute when the budget resets (local midnight). */
  now?: string | Date;
  timezone?: string;
}

export interface AiBudgetStatus {
  plan: Plan;
  limit: number;
  usedToday: number;
  remaining: number;
  exhausted: boolean;
  /** ISO instant of the next local midnight when the counter resets. */
  resetsAt: string;
}

export const DEFAULT_BUDGET_TIMEZONE = 'Europe/Istanbul';

export function budgetLimitFor(plan: Plan, limits: AiDailyTokenLimits): number {
  return plan === 'pro' ? limits.pro : limits.free;
}

export function nextBudgetReset(
  now: string | Date = new Date(),
  timezone: string = DEFAULT_BUDGET_TIMEZONE,
): string {
  const todayKey = localDateKey(now, timezone);
  const tomorrowKey = localDateKey(
    addDays(zonedTimeToUtc(todayKey, '12:00', timezone), 1),
    timezone,
  );
  return zonedTimeToUtc(tomorrowKey, '00:00', timezone);
}

export function budgetStatus(input: AssertBudgetInput): AiBudgetStatus {
  const limit = Math.max(0, Math.floor(budgetLimitFor(input.plan, input.limits)));
  const usedToday = Math.max(0, Math.floor(input.usedToday));
  const requested = Math.max(0, Math.floor(input.requested ?? 0));
  const remaining = Math.max(0, limit - usedToday);
  const exhausted = usedToday >= limit || usedToday + requested > limit;
  return {
    plan: input.plan,
    limit,
    usedToday,
    remaining,
    exhausted,
    resetsAt: nextBudgetReset(input.now ?? new Date(), input.timezone ?? DEFAULT_BUDGET_TIMEZONE),
  };
}

export function budgetExceededMessage(plan: Plan, locale: Locale = 'tr'): string {
  if (locale === 'en') {
    return plan === 'free'
      ? "You've reached today's AI limit. It resets tomorrow — Pro gives you a lot more room."
      : "You've reached today's AI limit. You can pick up again tomorrow.";
  }
  return plan === 'free'
    ? 'Bugünkü yapay zekâ kullanım sınırına ulaştın. Yarın sıfırlanır; Pro ile çok daha geniş bir sınırın olur.'
    : 'Bugünkü yapay zekâ kullanım sınırına ulaştın. Yarın kaldığın yerden devam edebilirsin.';
}

/** Throws `AppError('quota_exceeded')` when the user's daily token budget is spent. */
export function assertBudget(input: AssertBudgetInput): AiBudgetStatus {
  const status = budgetStatus(input);
  if (!status.exhausted) return status;
  const nowMs = new Date(input.now ?? new Date()).getTime();
  const retryAfterSec = Math.max(60, Math.ceil((Date.parse(status.resetsAt) - nowMs) / 1000));
  throw new AppError('quota_exceeded', budgetExceededMessage(input.plan, input.locale ?? 'tr'), {
    retryAfterSec,
    details: {
      plan: status.plan,
      limit: status.limit,
      usedToday: status.usedToday,
      remaining: status.remaining,
      resetsAt: status.resetsAt,
      upgradeAvailable: input.plan === 'free',
    },
  });
}
