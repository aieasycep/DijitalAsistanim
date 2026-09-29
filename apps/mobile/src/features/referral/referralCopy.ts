/** Pure referral helpers: code normalisation and calm copy keys for redeem rejections. */
import type { TFunction } from 'i18next';

export const REFERRAL_CODE_RE = /^[A-Z0-9]{6,10}$/;

export function normalizeReferralCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '');
}

export function isReferralCodeShape(input: string): boolean {
  return REFERRAL_CODE_RE.test(normalizeReferralCode(input));
}

export interface RedeemResponse {
  ok: boolean;
  reason?: string;
  bonusDays?: number;
  message?: string;
}

function rejectionKey(reason: string | undefined): string | null {
  switch ((reason ?? '').toLowerCase()) {
    case 'self_referral':
    case 'self':
      return 'referral.self';
    case 'already_redeemed':
    case 'already':
      return 'referral.already';
    case 'invalid':
    case 'not_found':
    case 'unknown_code':
      return 'referral.invalid';
    case 'expired':
      return 'referral.expired';
    case 'limit_reached':
    case 'limit':
      return 'referral.limit';
    default:
      return null;
  }
}

/** Calm rejection copy: known reasons map to i18n, an explicit server message is shown as-is, else generic. */
export function rejectionCopy(response: RedeemResponse, t: TFunction): string {
  const key = rejectionKey(response.reason);
  if (key) return t(key);
  if (response.message && response.message.trim().length > 0) return response.message.trim();
  return t('referral.rejected');
}
