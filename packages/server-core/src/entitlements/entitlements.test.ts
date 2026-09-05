import { describe, expect, it } from 'vitest';
import type { ReferralCredit, Subscription } from '@da/domain';
import { FREE_QUOTAS, PRO_QUOTAS } from '@da/domain';
import { AppError } from '../errors';
import {
  applyRevenueCatEvent,
  assertAssistantQuota,
  assertFeature,
  assistantQuotaRemaining,
  canConnectAccount,
  hasFeature,
  resolveEntitlement,
  verifyRevenueCatAuth,
  type RevenueCatEvent,
} from './index';

const now = '2026-09-05T08:00:00.000Z';
const usage = { assistantQueriesToday: 0, capturesToday: 0, emailAccounts: 1, calendarAccounts: 1 };

function sub(partial: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub-1',
    userId: 'u1',
    source: 'revenuecat',
    status: 'active',
    plan: 'pro',
    productId: 'da_pro_monthly',
    entitlementId: 'pro',
    startsAt: '2026-08-05T08:00:00.000Z',
    expiresAt: '2026-10-05T08:00:00.000Z',
    isTrial: false,
    willRenew: true,
    store: 'app_store',
    revenuecatAppUserId: 'rc-u1',
    lastEventId: 'evt-1',
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

function credit(partial: Partial<ReferralCredit> = {}): ReferralCredit {
  return {
    id: 'cr-1',
    userId: 'u1',
    referralId: 'ref-1',
    days: 14,
    startsAt: '2026-09-01T00:00:00.000Z',
    expiresAt: '2026-09-15T00:00:00.000Z',
    role: 'referred',
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

function rcEvent(partial: Partial<RevenueCatEvent> = {}): RevenueCatEvent {
  return {
    id: 'evt-100',
    type: 'INITIAL_PURCHASE',
    app_user_id: 'rc-u1',
    product_id: 'da_pro_monthly',
    entitlement_ids: ['pro'],
    period_type: 'NORMAL',
    purchased_at_ms: Date.parse('2026-09-05T07:59:00.000Z'),
    expiration_at_ms: Date.parse('2026-10-05T07:59:00.000Z'),
    store: 'APP_STORE',
    environment: 'PRODUCTION',
    ...partial,
  };
}

describe('entitlements · resolveEntitlement', () => {
  it('is free with free quotas when nothing grants Pro', () => {
    const s = resolveEntitlement({ subscriptions: [], referralCredits: [], usage, now });
    expect(s.isPro).toBe(false);
    expect(s.plan).toBe('free');
    expect(s.source).toBe('none');
    expect(s.quotas).toEqual(FREE_QUOTAS);
    expect(s.usage).toEqual(usage);
  });

  it('grants Pro for an active RevenueCat subscription and exposes expiry & trial flag', () => {
    const s = resolveEntitlement({ subscriptions: [sub({ isTrial: true, status: 'trial' })], referralCredits: [], usage, now });
    expect(s.isPro).toBe(true);
    expect(s.source).toBe('revenuecat');
    expect(s.isTrial).toBe(true);
    expect(s.expiresAt).toBe('2026-10-05T08:00:00.000Z');
    expect(s.quotas).toEqual(PRO_QUOTAS);
  });

  it('ignores expired, not-yet-started, non-pro and foreign-entitlement subscriptions', () => {
    const cases: Subscription[] = [
      sub({ expiresAt: '2026-09-05T07:59:59.000Z' }),
      sub({ startsAt: '2026-09-06T00:00:00.000Z' }),
      sub({ status: 'expired' }),
      sub({ status: 'billing_issue' }),
      sub({ status: 'cancelled' }),
      sub({ plan: 'free' }),
      sub({ entitlementId: 'other' }),
    ];
    for (const c of cases) {
      expect(resolveEntitlement({ subscriptions: [c], referralCredits: [], usage, now }).isPro).toBe(false);
    }
  });

  it('keeps Pro during grace and tolerates small clock skew on startsAt', () => {
    expect(resolveEntitlement({ subscriptions: [sub({ status: 'grace' })], referralCredits: [], usage, now }).isPro).toBe(true);
    const skewed = sub({ startsAt: '2026-09-05T08:03:00.000Z' });
    expect(resolveEntitlement({ subscriptions: [skewed], referralCredits: [], usage, now }).isPro).toBe(true);
  });

  it('grants Pro from an unexpired referral credit with source referral', () => {
    const s = resolveEntitlement({ subscriptions: [], referralCredits: [credit()], usage, now });
    expect(s.isPro).toBe(true);
    expect(s.source).toBe('referral');
    expect(s.expiresAt).toBe('2026-09-15T00:00:00.000Z');
    expect(s.isTrial).toBe(false);
    const expired = credit({ expiresAt: '2026-09-04T00:00:00.000Z' });
    expect(resolveEntitlement({ subscriptions: [], referralCredits: [expired], usage, now }).isPro).toBe(false);
  });

  it('applies source precedence revenuecat > promo > demo > referral', () => {
    const promo = sub({ id: 'p', source: 'promo', store: 'promotional', expiresAt: '2027-01-01T00:00:00.000Z' });
    const demo = sub({ id: 'd', source: 'demo', store: 'demo', expiresAt: null });
    const s1 = resolveEntitlement({ subscriptions: [demo, promo], referralCredits: [credit()], usage, now });
    expect(s1.source).toBe('promo');
    expect(s1.expiresAt).toBe('2027-01-01T00:00:00.000Z');
    const s2 = resolveEntitlement({ subscriptions: [demo, promo, sub()], referralCredits: [credit()], usage, now });
    expect(s2.source).toBe('revenuecat');
    expect(s2.expiresAt).toBe('2026-10-05T08:00:00.000Z');
    const s3 = resolveEntitlement({ subscriptions: [demo], referralCredits: [credit()], usage, now });
    expect(s3.source).toBe('demo');
    expect(s3.expiresAt).toBeNull();
  });

  it('never reports negative usage', () => {
    const s = resolveEntitlement({ subscriptions: [], referralCredits: [], usage: { ...usage, assistantQueriesToday: -3 }, now });
    expect(s.usage.assistantQueriesToday).toBe(0);
  });
});

describe('entitlements · features & quotas', () => {
  const free = resolveEntitlement({ subscriptions: [], referralCredits: [], usage, now });
  const pro = resolveEntitlement({ subscriptions: [sub()], referralCredits: [], usage, now });

  it('hasFeature gates Pro-only features', () => {
    expect(hasFeature(free, 'meeting_prep')).toBe(false);
    expect(hasFeature(pro, 'meeting_prep')).toBe(true);
  });

  it('assertFeature throws quota_exceeded with the feature in details', () => {
    expect(() => assertFeature(free, 'voice_briefing')).toThrow(AppError);
    try {
      assertFeature(free, 'voice_briefing', 'en');
    } catch (e) {
      const err = e as AppError;
      expect(err.code).toBe('quota_exceeded');
      expect(err.status).toBe(402);
      expect(err.details).toMatchObject({ feature: 'voice_briefing', requiredPlan: 'pro' });
      expect(err.message).toBe('This feature is available on Pro.');
    }
    expect(() => assertFeature(pro, 'voice_briefing')).not.toThrow();
  });

  it('canConnectAccount respects free (1) and pro (10) account quotas', () => {
    expect(canConnectAccount(free, 'email', 0)).toBe(true);
    expect(canConnectAccount(free, 'email', 1)).toBe(false);
    expect(canConnectAccount(free, 'calendar', 1)).toBe(false);
    expect(canConnectAccount(pro, 'email', 9)).toBe(true);
    expect(canConnectAccount(pro, 'email', 10)).toBe(false);
    expect(canConnectAccount(free, 'reminders', 5)).toBe(true);
    expect(canConnectAccount(free, 'notifications', 0)).toBe(false);
    expect(canConnectAccount(pro, 'notifications', 0)).toBe(true);
  });

  it('assistant quota: remaining and assertion', () => {
    expect(assistantQuotaRemaining(free)).toBe(10);
    const exhausted = resolveEntitlement({ subscriptions: [], referralCredits: [], usage: { ...usage, assistantQueriesToday: 10 }, now });
    expect(assistantQuotaRemaining(exhausted)).toBe(0);
    expect(() => assertAssistantQuota(exhausted)).toThrow('Bugünkü asistan hakkın doldu. Yarın yeniden sorabilirsin.');
    try {
      assertAssistantQuota(exhausted);
    } catch (e) {
      expect((e as AppError).details).toMatchObject({ feature: 'unlimited_assistant', limit: 10, used: 10 });
    }
    const proBusy = resolveEntitlement({ subscriptions: [sub()], referralCredits: [], usage: { ...usage, assistantQueriesToday: 10 }, now });
    expect(() => assertAssistantQuota(proBusy)).not.toThrow();
  });
});

describe('entitlements · applyRevenueCatEvent', () => {
  it('INITIAL_PURCHASE with TRIAL period creates a trial subscription', () => {
    const r = applyRevenueCatEvent(null, rcEvent({ period_type: 'TRIAL' }), { now, userId: 'u1' });
    expect(r.changed).toBe(true);
    if (!r.changed) return;
    expect(r.subscription).toMatchObject({
      userId: 'u1',
      source: 'revenuecat',
      status: 'trial',
      plan: 'pro',
      isTrial: true,
      willRenew: true,
      store: 'app_store',
      productId: 'da_pro_monthly',
      entitlementId: 'pro',
      revenuecatAppUserId: 'rc-u1',
      lastEventId: 'evt-100',
      startsAt: '2026-09-05T07:59:00.000Z',
      expiresAt: '2026-10-05T07:59:00.000Z',
    });
    expect(r.subscription.id).toBeUndefined();
    expect(r.sandbox).toBe(false);
  });

  it('is idempotent by event id and ignores TEST / unknown / foreign-entitlement events', () => {
    const existing = sub({ lastEventId: 'evt-100' });
    expect(applyRevenueCatEvent(existing, rcEvent(), { now, userId: 'u1' })).toMatchObject({ changed: false, reason: 'duplicate_event' });
    expect(applyRevenueCatEvent(null, rcEvent({ id: 'e2', type: 'TEST' }), { now, userId: 'u1' })).toMatchObject({ changed: false, reason: 'test_event' });
    expect(applyRevenueCatEvent(null, rcEvent({ id: 'e3', type: 'SOMETHING_NEW' }), { now, userId: 'u1' })).toMatchObject({ changed: false, reason: 'unsupported_event_type' });
    expect(applyRevenueCatEvent(null, rcEvent({ id: 'e4', entitlement_ids: ['other'] }), { now, userId: 'u1' })).toMatchObject({ changed: false, reason: 'foreign_entitlement' });
  });

  it('RENEWAL keeps the existing row id and extends expiry', () => {
    const r = applyRevenueCatEvent(sub(), rcEvent({ id: 'e5', type: 'RENEWAL', expiration_at_ms: Date.parse('2026-11-05T08:00:00.000Z') }), { now, userId: 'u1' });
    expect(r.changed).toBe(true);
    if (!r.changed) return;
    expect(r.subscription.id).toBe('sub-1');
    expect(r.subscription.status).toBe('active');
    expect(r.subscription.expiresAt).toBe('2026-11-05T08:00:00.000Z');
    expect(r.subscription.lastEventId).toBe('e5');
  });

  it('CANCELLATION keeps access until expiry with willRenew=false; refunds cancel immediately', () => {
    const r = applyRevenueCatEvent(sub(), rcEvent({ id: 'e6', type: 'CANCELLATION', purchased_at_ms: undefined }), { now, userId: 'u1' });
    expect(r.changed).toBe(true);
    if (!r.changed) return;
    expect(r.subscription.status).toBe('active');
    expect(r.subscription.willRenew).toBe(false);
    expect(r.subscription.startsAt).toBe('2026-08-05T08:00:00.000Z');
    expect(resolveEntitlement({ subscriptions: [{ ...sub(), ...r.subscription, id: 'sub-1' }], referralCredits: [], usage, now }).isPro).toBe(true);

    const refund = applyRevenueCatEvent(sub(), rcEvent({ id: 'e7', type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT', expiration_at_ms: Date.parse(now) - 1000 }), { now, userId: 'u1' });
    expect(refund.changed && refund.subscription.status).toBe('cancelled');
  });

  it('UNCANCELLATION restores renewal, EXPIRATION expires, SUBSCRIPTION_PAUSED stops renewal', () => {
    const cancelled = sub({ willRenew: false });
    const un = applyRevenueCatEvent(cancelled, rcEvent({ id: 'e8', type: 'UNCANCELLATION' }), { now, userId: 'u1' });
    expect(un.changed && un.subscription.willRenew).toBe(true);
    expect(un.changed && un.subscription.status).toBe('active');

    const ex = applyRevenueCatEvent(sub(), rcEvent({ id: 'e9', type: 'EXPIRATION', expiration_at_ms: Date.parse(now) - 60_000 }), { now, userId: 'u1' });
    expect(ex.changed && ex.subscription.status).toBe('expired');
    expect(ex.changed && ex.subscription.willRenew).toBe(false);

    const paused = applyRevenueCatEvent(sub(), rcEvent({ id: 'e10', type: 'SUBSCRIPTION_PAUSED' }), { now, userId: 'u1' });
    expect(paused.changed && paused.subscription.status).toBe('active');
    expect(paused.changed && paused.subscription.willRenew).toBe(false);
  });

  it('BILLING_ISSUE is grace while expiry is ahead, billing_issue afterwards', () => {
    const grace = applyRevenueCatEvent(sub(), rcEvent({ id: 'e11', type: 'BILLING_ISSUE' }), { now, userId: 'u1' });
    expect(grace.changed && grace.subscription.status).toBe('grace');
    const issue = applyRevenueCatEvent(sub(), rcEvent({ id: 'e12', type: 'BILLING_ISSUE', expiration_at_ms: Date.parse(now) - 1 }), { now, userId: 'u1' });
    expect(issue.changed && issue.subscription.status).toBe('billing_issue');
  });

  it('PRODUCT_CHANGE swaps the product, TRANSFER marks transferred and updates the RC user id', () => {
    const pc = applyRevenueCatEvent(sub(), rcEvent({ id: 'e13', type: 'PRODUCT_CHANGE', product_id: 'da_pro_annual' }), { now, userId: 'u1' });
    expect(pc.changed && pc.subscription.productId).toBe('da_pro_annual');
    const tr = applyRevenueCatEvent(null, rcEvent({ id: 'e14', type: 'TRANSFER', app_user_id: 'rc-u2', product_id: undefined }), { now, userId: 'u2' });
    expect(tr.changed).toBe(true);
    if (!tr.changed) return;
    expect(tr.transferred).toBe(true);
    expect(tr.subscription.revenuecatAppUserId).toBe('rc-u2');
    expect(tr.subscription.userId).toBe('u2');
    expect(tr.subscription.productId).toBeNull();
  });

  it('flags SANDBOX events and maps promotional stores to the promo source', () => {
    const r = applyRevenueCatEvent(null, rcEvent({ id: 'e15', environment: 'SANDBOX', store: 'PROMOTIONAL' }), { now, userId: 'u1' });
    expect(r.sandbox).toBe(true);
    expect(r.changed && r.subscription.source).toBe('promo');
    expect(r.changed && r.subscription.store).toBe('promotional');
  });
});

describe('entitlements · verifyRevenueCatAuth', () => {
  it('accepts the raw secret or a Bearer form and rejects everything else', () => {
    expect(verifyRevenueCatAuth('s3cret', 's3cret')).toBe(true);
    expect(verifyRevenueCatAuth('Bearer s3cret', 's3cret')).toBe(true);
    expect(verifyRevenueCatAuth('s3cret ', 's3cret')).toBe(true);
    expect(verifyRevenueCatAuth('s3cre', 's3cret')).toBe(false);
    expect(verifyRevenueCatAuth('', 's3cret')).toBe(false);
    expect(verifyRevenueCatAuth(null, 's3cret')).toBe(false);
    expect(verifyRevenueCatAuth('anything', '')).toBe(false);
  });
});
