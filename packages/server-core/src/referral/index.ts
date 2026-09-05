/**
 * referral — invite codes, redemption rules ("both sides get 14 days of Pro") and share copy.
 *
 * Abuse limits are deliberately conservative: no self-referral, one redemption per account,
 * only accounts younger than 7 days may redeem, a device fingerprint seen on the referrer's
 * account cannot redeem, and a referrer earns at most 20 redemptions per 30 days.
 */
import type { Locale, ReferralCredit } from '@da/domain';
import { DeepLinks, REFERRAL_BONUS_DAYS, toUniversalUrl } from '@da/domain';
import { isValidReferralCodeFormat, normalizeReferralCode } from '../crypto';
import { DAY } from '../util';

export { generateReferralCode, isValidReferralCodeFormat, normalizeReferralCode } from '../crypto';

export const REFERRAL_MAX_ACCOUNT_AGE_DAYS = 7;
export const REFERRAL_REFERRER_LIMIT_PER_30D = 20;
export const REFERRAL_CREDIT_DAYS = REFERRAL_BONUS_DAYS;

export type RedemptionRejectReason =
  | 'self_referral'
  | 'already_redeemed'
  | 'invalid'
  | 'device_reuse'
  | 'referrer_limit'
  | 'account_too_old';

export interface ValidateRedemptionInput {
  /** Code as typed by the user; normalized (uppercase, no dashes/spaces) before checks. */
  code: string;
  redeemerUserId: string;
  redeemerCreatedAt: string;
  redeemerAlreadyRedeemed: boolean;
  /** Owner of the code, or null when no such code exists. */
  referrerUserId: string | null;
  referrerRedemptionsLast30d: number;
  deviceFingerprintHash?: string | null;
  /** Device fingerprint hashes already associated with the referrer's account. */
  referrerDeviceHashes: readonly string[];
  /** When the referrer already has a running credit, the new one starts when it ends. */
  referrerCreditExpiresAt?: string | null;
  now: string;
  locale?: Locale;
}

export type ReferralCreditDraft = Pick<
  ReferralCredit,
  'userId' | 'role' | 'days' | 'startsAt' | 'expiresAt'
>;

export type RedemptionResult =
  | { ok: true; code: string; referrerUserId: string; credits: ReferralCreditDraft[] }
  | { ok: false; reason: RedemptionRejectReason; message: string };

const REJECT_MESSAGES: Record<Locale, Record<RedemptionRejectReason, string>> = {
  tr: {
    self_referral: 'Kendi davet kodunu kullanamazsın.',
    already_redeemed: 'Bu hesapta daha önce bir davet kodu kullanılmış.',
    invalid: 'Bu davet kodu geçerli değil.',
    device_reuse: 'Bu cihazda davet kodu kullanılamıyor.',
    referrer_limit: 'Bu kod şimdilik kullanım sınırına ulaştı. Daha sonra tekrar deneyebilirsin.',
    account_too_old: 'Davet kodları yalnızca yeni hesaplarda kullanılabilir.',
  },
  en: {
    self_referral: 'You cannot use your own invite code.',
    already_redeemed: 'An invite code has already been used on this account.',
    invalid: 'This invite code is not valid.',
    device_reuse: 'Invite codes cannot be used on this device.',
    referrer_limit: 'This code has reached its limit for now. Please try again later.',
    account_too_old: 'Invite codes can only be used on new accounts.',
  },
};

export function redemptionMessage(reason: RedemptionRejectReason, locale: Locale = 'tr'): string {
  return REJECT_MESSAGES[locale][reason];
}

function creditWindow(startsAtIso: string, days: number): { startsAt: string; expiresAt: string } {
  const start = new Date(startsAtIso).toISOString();
  return { startsAt: start, expiresAt: new Date(Date.parse(start) + days * DAY).toISOString() };
}

/**
 * Decide whether a redemption is allowed and, if so, which credits to grant.
 * Pure: the caller loads the inputs and persists the credits inside one transaction.
 */
export function validateRedemption(input: ValidateRedemptionInput): RedemptionResult {
  const locale = input.locale ?? 'tr';
  const reject = (reason: RedemptionRejectReason): RedemptionResult => ({
    ok: false,
    reason,
    message: redemptionMessage(reason, locale),
  });

  const code = normalizeReferralCode(input.code);
  if (!isValidReferralCodeFormat(code)) return reject('invalid');
  if (!input.referrerUserId) return reject('invalid');
  if (input.referrerUserId === input.redeemerUserId) return reject('self_referral');
  if (input.redeemerAlreadyRedeemed) return reject('already_redeemed');

  const nowMs = Date.parse(input.now);
  const createdMs = Date.parse(input.redeemerCreatedAt);
  if (Number.isNaN(nowMs) || Number.isNaN(createdMs)) return reject('invalid');
  if (nowMs - createdMs > REFERRAL_MAX_ACCOUNT_AGE_DAYS * DAY) return reject('account_too_old');

  const device = input.deviceFingerprintHash?.trim();
  if (device && input.referrerDeviceHashes.some((h) => h.trim() === device))
    return reject('device_reuse');
  if (input.referrerRedemptionsLast30d >= REFERRAL_REFERRER_LIMIT_PER_30D)
    return reject('referrer_limit');

  const referredWindow = creditWindow(input.now, REFERRAL_CREDIT_DAYS);
  const referrerRunningUntil = input.referrerCreditExpiresAt
    ? Date.parse(input.referrerCreditExpiresAt)
    : Number.NaN;
  const referrerStart =
    !Number.isNaN(referrerRunningUntil) && referrerRunningUntil > nowMs
      ? new Date(referrerRunningUntil).toISOString()
      : input.now;
  const referrerWindow = creditWindow(referrerStart, REFERRAL_CREDIT_DAYS);

  return {
    ok: true,
    code,
    referrerUserId: input.referrerUserId,
    credits: [
      {
        userId: input.referrerUserId,
        role: 'referrer',
        days: REFERRAL_CREDIT_DAYS,
        ...referrerWindow,
      },
      {
        userId: input.redeemerUserId,
        role: 'referred',
        days: REFERRAL_CREDIT_DAYS,
        ...referredWindow,
      },
    ],
  };
}

// --- Sharing ------------------------------------------------------------------------------------

export interface ShareTextInput {
  code: string;
  inviteUrl: string;
  locale?: Locale;
}

/** Universal link that opens the app on the referral screen (web fallback on desktop). */
export function inviteUrl(webUrl: string, code: string): string {
  return toUniversalUrl(webUrl, DeepLinks.referral(normalizeReferralCode(code)));
}

export function buildShareText(input: ShareTextInput): string {
  const code = normalizeReferralCode(input.code);
  if ((input.locale ?? 'tr') === 'en') {
    return [
      "I'm using Dijital Asistan: it reads my mail and calendar and prepares a calm morning briefing.",
      `Join with my code ${code} and we both get ${REFERRAL_CREDIT_DAYS} days of Pro.`,
      input.inviteUrl,
    ].join('\n');
  }
  return [
    'Dijital Asistan kullanıyorum: maillerimi ve takvimimi takip edip sabah brifingimi hazırlıyor.',
    `${code} koduyla katıl, ikimiz de ${REFERRAL_CREDIT_DAYS} gün Pro kazanalım.`,
    input.inviteUrl,
  ].join('\n');
}

/** wa.me share link; WhatsApp opens the composer with the text prefilled. */
export function whatsappShareUrl(text: string): string {
  const url = new URL('https://wa.me/');
  url.searchParams.set('text', text);
  return url.toString();
}
