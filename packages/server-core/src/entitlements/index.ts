/**
 * entitlements — the single place that decides whether a user is Pro, which quotas apply and
 * how RevenueCat webhook events turn into subscription rows.
 *
 * Pro is granted by an unexpired active/trial/grace subscription for the `pro` entitlement
 * (sources revenuecat > promo > demo) or by an unexpired referral credit. Everything else is Free.
 */
import type {
  AccountKind,
  EntitlementState,
  Feature,
  Locale,
  ReferralCredit,
  Subscription,
  SubscriptionSource,
  SubscriptionStatus,
} from '@da/domain';
import { ENTITLEMENT_ID, FEATURE_PLAN, FREE_QUOTAS, PRO_QUOTAS } from '@da/domain';
import type { revenueCatWebhookSchema, z } from '@da/validation';
import { timingSafeEqual } from '../crypto';
import { AppError } from '../errors';
import { MINUTE } from '../util';

// --- Resolver ---------------------------------------------------------------------------------

export type EntitlementUsage = EntitlementState['usage'];

export interface ResolveEntitlementInput {
  subscriptions: readonly Subscription[];
  referralCredits: readonly ReferralCredit[];
  usage: EntitlementUsage;
  /** ISO instant used for all expiry checks. */
  now: string;
}

/** Sources that can grant Pro, most authoritative first. */
export const ENTITLEMENT_SOURCE_PRECEDENCE: readonly SubscriptionSource[] = [
  'revenuecat',
  'promo',
  'demo',
  'referral',
];

/** Subscription statuses that keep the entitlement alive (until `expiresAt`). */
export const PRO_GRANTING_STATUSES: readonly SubscriptionStatus[] = ['active', 'trial', 'grace'];

/** Clock skew tolerated between the store and our server for `startsAt`. */
const START_SKEW_MS = 5 * MINUTE;

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function isWithin(startsAt: string, expiresAt: string | null | undefined, nowMs: number): boolean {
  const start = parseMs(startsAt);
  if (start === null || start > nowMs + START_SKEW_MS) return false;
  const end = parseMs(expiresAt);
  return end === null || end > nowMs;
}

/** True when this subscription row grants Pro at `now`. */
export function subscriptionGrantsPro(sub: Subscription, now: string): boolean {
  const nowMs = Date.parse(now);
  if (sub.plan !== 'pro' || sub.entitlementId !== ENTITLEMENT_ID) return false;
  const statusOk =
    PRO_GRANTING_STATUSES.includes(sub.status) ||
    (sub.source === 'referral' && sub.status === 'referral_bonus');
  if (!statusOk) return false;
  return isWithin(sub.startsAt, sub.expiresAt, nowMs);
}

/** True when this referral credit grants Pro at `now`. */
export function referralCreditGrantsPro(credit: ReferralCredit, now: string): boolean {
  return credit.days > 0 && isWithin(credit.startsAt, credit.expiresAt, Date.parse(now));
}

function sourceRank(source: SubscriptionSource): number {
  const idx = ENTITLEMENT_SOURCE_PRECEDENCE.indexOf(source);
  return idx === -1 ? ENTITLEMENT_SOURCE_PRECEDENCE.length : idx;
}

function laterIso(a: string | null | undefined, b: string | null | undefined): string | null {
  const am = parseMs(a);
  const bm = parseMs(b);
  if (am === null && bm === null) return null;
  if (am === null) return b ?? null;
  if (bm === null) return a ?? null;
  return am >= bm ? (a ?? null) : (b ?? null);
}

function quotasFor(isPro: boolean): EntitlementState['quotas'] {
  return isPro ? { ...PRO_QUOTAS } : { ...FREE_QUOTAS };
}

/**
 * Resolve the effective entitlement. Deterministic: same inputs → same state.
 * Source precedence: revenuecat > promo > demo > referral. Expiry is the latest expiry among the
 * grants of the winning source (null = no expiry, e.g. an open-ended promo).
 */
export function resolveEntitlement(input: ResolveEntitlementInput): EntitlementState {
  const { now } = input;
  const grants: { source: SubscriptionSource; expiresAt: string | null; isTrial: boolean }[] = [];

  for (const sub of input.subscriptions) {
    if (!subscriptionGrantsPro(sub, now)) continue;
    grants.push({ source: sub.source, expiresAt: sub.expiresAt ?? null, isTrial: sub.isTrial });
  }
  for (const credit of input.referralCredits) {
    if (!referralCreditGrantsPro(credit, now)) continue;
    grants.push({ source: 'referral', expiresAt: credit.expiresAt, isTrial: false });
  }

  const usage: EntitlementUsage = {
    assistantQueriesToday: Math.max(0, input.usage.assistantQueriesToday),
    capturesToday: Math.max(0, input.usage.capturesToday),
    emailAccounts: Math.max(0, input.usage.emailAccounts),
    calendarAccounts: Math.max(0, input.usage.calendarAccounts),
  };

  if (grants.length === 0) {
    return {
      plan: 'free',
      isPro: false,
      source: 'none',
      expiresAt: null,
      isTrial: false,
      quotas: quotasFor(false),
      usage,
    };
  }

  grants.sort((a, b) => sourceRank(a.source) - sourceRank(b.source));
  const winnerSource = grants[0]?.source ?? 'none';
  const winners = grants.filter((g) => g.source === winnerSource);
  const openEnded = winners.some((g) => g.expiresAt === null);
  let expiresAt: string | null = null;
  for (const g of winners) expiresAt = laterIso(expiresAt, g.expiresAt);
  // A trial only counts as trial when every grant of the winning source is a trial.
  const isTrial = winners.every((g) => g.isTrial);

  return {
    plan: 'pro',
    isPro: true,
    source: winnerSource,
    expiresAt: openEnded ? null : expiresAt,
    isTrial,
    quotas: quotasFor(true),
    usage,
  };
}

// --- Feature & quota checks -------------------------------------------------------------------

const MESSAGES = {
  tr: {
    feature: 'Bu özellik Pro planında kullanılabilir.',
    assistant: 'Bugünkü asistan hakkın doldu. Yarın yeniden sorabilirsin.',
    captures: 'Bugünkü yakalama hakkın doldu.',
  },
  en: {
    feature: 'This feature is available on Pro.',
    assistant: 'You have used today’s assistant quota. You can ask again tomorrow.',
    captures: 'You have used today’s capture quota.',
  },
} as const satisfies Record<Locale, Record<string, string>>;

export function hasFeature(state: EntitlementState, feature: Feature): boolean {
  return FEATURE_PLAN[feature] === 'free' || state.isPro;
}

/** Throws `quota_exceeded` (HTTP 402) with `details.feature` when the feature is not available. */
export function assertFeature(
  state: EntitlementState,
  feature: Feature,
  locale: Locale = 'tr',
): void {
  if (hasFeature(state, feature)) return;
  throw new AppError('quota_exceeded', MESSAGES[locale].feature, {
    details: { feature, plan: state.plan, requiredPlan: FEATURE_PLAN[feature] },
  });
}

/**
 * Can one more account of this kind be connected?
 *  - email / calendar: plan quota.
 *  - tasks: shares the calendar quota (Google Tasks / Microsoft To Do ride on the same account).
 *  - reminders: device-local, always allowed.
 *  - notifications: Android notification intelligence is a Pro feature.
 */
export function canConnectAccount(
  state: EntitlementState,
  kind: AccountKind,
  currentCount: number,
): boolean {
  const count = Math.max(0, currentCount);
  switch (kind) {
    case 'email':
      return count < state.quotas.maxEmailAccounts;
    case 'calendar':
    case 'tasks':
      return count < state.quotas.maxCalendarAccounts;
    case 'reminders':
      return true;
    case 'notifications':
      return hasFeature(state, 'android_notification_intelligence');
  }
}

export function assistantQuotaRemaining(state: EntitlementState): number {
  return Math.max(0, state.quotas.assistantQueriesPerDay - state.usage.assistantQueriesToday);
}

export function captureQuotaRemaining(state: EntitlementState): number {
  return Math.max(0, state.quotas.capturesPerDay - state.usage.capturesToday);
}

/** Throws `quota_exceeded` when the daily assistant quota is used up. */
export function assertAssistantQuota(state: EntitlementState, locale: Locale = 'tr'): void {
  const remaining = assistantQuotaRemaining(state);
  if (remaining > 0) return;
  throw new AppError('quota_exceeded', MESSAGES[locale].assistant, {
    details: {
      feature: 'unlimited_assistant',
      limit: state.quotas.assistantQueriesPerDay,
      used: state.usage.assistantQueriesToday,
      remaining: 0,
    },
  });
}

/** Throws `quota_exceeded` when the daily capture quota is used up. */
export function assertCaptureQuota(state: EntitlementState, locale: Locale = 'tr'): void {
  const remaining = captureQuotaRemaining(state);
  if (remaining > 0) return;
  throw new AppError('quota_exceeded', MESSAGES[locale].captures, {
    details: {
      feature: 'advanced_capture',
      limit: state.quotas.capturesPerDay,
      used: state.usage.capturesToday,
      remaining: 0,
    },
  });
}

// --- RevenueCat -------------------------------------------------------------------------------

export type RevenueCatWebhook = z.infer<typeof revenueCatWebhookSchema>;
export type RevenueCatEvent = RevenueCatWebhook['event'];

export const REVENUECAT_EVENT_TYPES = [
  'INITIAL_PURCHASE',
  'RENEWAL',
  'CANCELLATION',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'EXPIRATION',
  'BILLING_ISSUE',
  'PRODUCT_CHANGE',
  'TRANSFER',
  'SUBSCRIPTION_PAUSED',
  'SUBSCRIPTION_EXTENDED',
  'TEST',
] as const;
export type RevenueCatEventType = (typeof REVENUECAT_EVENT_TYPES)[number];

/** Subscription row to insert/update; `id` is present when an existing row is being updated. */
export type SubscriptionDraft = Omit<Subscription, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
};

export type RevenueCatIgnoreReason =
  'duplicate_event' | 'test_event' | 'unsupported_event_type' | 'foreign_entitlement';

export type RevenueCatApplyResult =
  | { changed: false; reason: RevenueCatIgnoreReason; eventId: string; sandbox: boolean }
  | {
      changed: true;
      subscription: SubscriptionDraft;
      eventType: RevenueCatEventType;
      eventId: string;
      /** True for SANDBOX events — production handlers usually skip persisting these. */
      sandbox: boolean;
      /** True when the subscription moved from another RevenueCat app user (TRANSFER). */
      transferred: boolean;
    };

export interface ApplyRevenueCatOptions {
  now: string;
  userId: string;
}

function isKnownEventType(type: string): type is RevenueCatEventType {
  return (REVENUECAT_EVENT_TYPES as readonly string[]).includes(type);
}

function msToIso(ms: number | null | undefined): string | null {
  return typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function mapStore(
  store: string | undefined,
  existing: Subscription['store'] | undefined,
): Subscription['store'] {
  switch ((store ?? '').toUpperCase()) {
    case 'APP_STORE':
    case 'MAC_APP_STORE':
      return 'app_store';
    case 'PLAY_STORE':
    case 'AMAZON':
      return 'play_store';
    case 'PROMOTIONAL':
      return 'promotional';
    default:
      return existing ?? null;
  }
}

/**
 * Fold one RevenueCat webhook event into the user's subscription row (pure; nothing is persisted).
 *  - Idempotent by event id: a repeat of the last applied event returns `{ changed: false }`.
 *  - TEST events and events for other entitlements are ignored.
 *  - CANCELLATION keeps access until `expiresAt` (only `willRenew` flips); refunds that already
 *    expired the period become `cancelled`.
 *  - BILLING_ISSUE becomes `grace` while the (grace-extended) expiry is in the future, else `billing_issue`.
 */
export function applyRevenueCatEvent(
  existing: Subscription | null,
  event: RevenueCatEvent,
  opts: ApplyRevenueCatOptions,
): RevenueCatApplyResult {
  const sandbox = (event.environment ?? '').toUpperCase() === 'SANDBOX';
  const type = event.type.toUpperCase();
  const base = { eventId: event.id, sandbox } as const;

  if (existing?.lastEventId === event.id)
    return { changed: false, reason: 'duplicate_event', ...base };
  if (!isKnownEventType(type)) return { changed: false, reason: 'unsupported_event_type', ...base };
  if (type === 'TEST') return { changed: false, reason: 'test_event', ...base };
  const entitlements = event.entitlement_ids ?? [];
  if (entitlements.length > 0 && !entitlements.includes(ENTITLEMENT_ID)) {
    return { changed: false, reason: 'foreign_entitlement', ...base };
  }

  const nowMs = Date.parse(opts.now);
  const isTrial = (event.period_type ?? '').toUpperCase() === 'TRIAL';
  const store = mapStore(event.store, existing?.store);
  const expiresAt = msToIso(event.expiration_at_ms) ?? existing?.expiresAt ?? null;
  const expiresMs = parseMs(expiresAt);
  const stillValid = expiresMs === null || expiresMs > nowMs;
  const purchasedAt = msToIso(event.purchased_at_ms);
  const liveStatus: SubscriptionStatus = isTrial ? 'trial' : 'active';

  let status: SubscriptionStatus;
  let willRenew: boolean;
  let startsAt = purchasedAt ?? existing?.startsAt ?? opts.now;

  switch (type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'UNCANCELLATION':
    case 'PRODUCT_CHANGE':
    case 'SUBSCRIPTION_EXTENDED':
    case 'TRANSFER':
      status = stillValid ? liveStatus : 'expired';
      willRenew = stillValid;
      if (type === 'UNCANCELLATION' || type === 'SUBSCRIPTION_EXTENDED')
        startsAt = existing?.startsAt ?? startsAt;
      break;
    case 'NON_RENEWING_PURCHASE':
      status = stillValid ? liveStatus : 'expired';
      willRenew = false;
      break;
    case 'CANCELLATION':
      // Auto-renew turned off; the paid period stays usable. Refunds carry an expiry in the past.
      status = stillValid
        ? existing?.status === 'trial' || isTrial
          ? 'trial'
          : 'active'
        : 'cancelled';
      willRenew = false;
      startsAt = existing?.startsAt ?? startsAt;
      break;
    case 'SUBSCRIPTION_PAUSED':
      status = stillValid ? (existing?.status === 'trial' ? 'trial' : 'active') : 'expired';
      willRenew = false;
      startsAt = existing?.startsAt ?? startsAt;
      break;
    case 'EXPIRATION':
      status = 'expired';
      willRenew = false;
      startsAt = existing?.startsAt ?? startsAt;
      break;
    case 'BILLING_ISSUE':
      status = stillValid ? 'grace' : 'billing_issue';
      willRenew = existing?.willRenew ?? true;
      startsAt = existing?.startsAt ?? startsAt;
      break;
  }

  const subscription: SubscriptionDraft = {
    ...(existing ? { id: existing.id } : {}),
    userId: opts.userId,
    source: store === 'promotional' ? 'promo' : 'revenuecat',
    status,
    plan: 'pro',
    productId: event.product_id ?? existing?.productId ?? null,
    entitlementId: ENTITLEMENT_ID,
    startsAt,
    expiresAt: type === 'EXPIRATION' ? (expiresAt ?? opts.now) : expiresAt,
    isTrial:
      type === 'EXPIRATION' || type === 'CANCELLATION' ? (existing?.isTrial ?? isTrial) : isTrial,
    willRenew,
    store,
    revenuecatAppUserId: event.app_user_id,
    lastEventId: event.id,
  };

  return {
    changed: true,
    subscription,
    eventType: type,
    transferred: type === 'TRANSFER',
    ...base,
  };
}

/**
 * RevenueCat sends the configured secret verbatim in the `Authorization` header; some setups
 * configure it as `Bearer <secret>`. Both forms are accepted, compared in constant time.
 */
export function verifyRevenueCatAuth(
  headerValue: string | null | undefined,
  secret: string,
): boolean {
  if (!secret || !headerValue) return false;
  const raw = headerValue.trim();
  const direct = timingSafeEqual(raw, secret);
  const bearer = timingSafeEqual(raw, `Bearer ${secret}`);
  return direct || bearer;
}
