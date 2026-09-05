import { describe, expect, it } from 'vitest';
import {
  buildShareText,
  generateReferralCode,
  inviteUrl,
  validateRedemption,
  whatsappShareUrl,
  type ValidateRedemptionInput,
} from './index';

const now = '2026-09-05T08:00:00.000Z';

function input(partial: Partial<ValidateRedemptionInput> = {}): ValidateRedemptionInput {
  return {
    code: 'ABCD2345',
    redeemerUserId: 'user-ayse',
    redeemerCreatedAt: '2026-09-04T10:00:00.000Z',
    redeemerAlreadyRedeemed: false,
    referrerUserId: 'user-mehmet',
    referrerRedemptionsLast30d: 3,
    deviceFingerprintHash: 'dev-1',
    referrerDeviceHashes: ['dev-9'],
    now,
    ...partial,
  };
}

describe('referral · generateReferralCode', () => {
  it('produces 8 unambiguous uppercase characters (no 0/O/1/I)', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateReferralCode();
      expect(code).toHaveLength(8);
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    }
    const codes = new Set(Array.from({ length: 50 }, () => generateReferralCode()));
    expect(codes.size).toBeGreaterThan(45);
  });
});

describe('referral · validateRedemption', () => {
  it('grants 14 days to both sides, referred starting now', () => {
    const r = validateRedemption(input({ code: 'abcd-2345' }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.code).toBe('ABCD2345');
    expect(r.referrerUserId).toBe('user-mehmet');
    expect(r.credits).toEqual([
      { userId: 'user-mehmet', role: 'referrer', days: 14, startsAt: now, expiresAt: '2026-09-19T08:00:00.000Z' },
      { userId: 'user-ayse', role: 'referred', days: 14, startsAt: now, expiresAt: '2026-09-19T08:00:00.000Z' },
    ]);
  });

  it('stacks the referrer credit after a running one', () => {
    const r = validateRedemption(input({ referrerCreditExpiresAt: '2026-09-10T08:00:00.000Z' }));
    expect(r.ok && r.credits[0]).toMatchObject({ role: 'referrer', startsAt: '2026-09-10T08:00:00.000Z', expiresAt: '2026-09-24T08:00:00.000Z' });
    const past = validateRedemption(input({ referrerCreditExpiresAt: '2026-09-01T08:00:00.000Z' }));
    expect(past.ok && past.credits[0]?.startsAt).toBe(now);
  });

  it('rejects malformed or unknown codes as invalid with a Turkish message', () => {
    expect(validateRedemption(input({ code: 'ABC' }))).toEqual({ ok: false, reason: 'invalid', message: 'Bu davet kodu geçerli değil.' });
    expect(validateRedemption(input({ code: 'ABCD0123' }))).toMatchObject({ ok: false, reason: 'invalid' });
    expect(validateRedemption(input({ referrerUserId: null }))).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('rejects self-referral, repeat redemption and old accounts', () => {
    expect(validateRedemption(input({ referrerUserId: 'user-ayse' }))).toMatchObject({ ok: false, reason: 'self_referral' });
    expect(validateRedemption(input({ redeemerAlreadyRedeemed: true }))).toMatchObject({ ok: false, reason: 'already_redeemed' });
    const old = validateRedemption(input({ redeemerCreatedAt: '2026-08-28T07:59:00.000Z', locale: 'en' }));
    expect(old).toEqual({ ok: false, reason: 'account_too_old', message: 'Invite codes can only be used on new accounts.' });
    expect(validateRedemption(input({ redeemerCreatedAt: '2026-08-29T08:00:00.000Z' })).ok).toBe(true);
  });

  it('rejects device reuse and referrers over the 30-day cap', () => {
    expect(validateRedemption(input({ referrerDeviceHashes: ['dev-1', 'dev-9'] }))).toMatchObject({ ok: false, reason: 'device_reuse' });
    expect(validateRedemption(input({ deviceFingerprintHash: null, referrerDeviceHashes: ['dev-1'] })).ok).toBe(true);
    expect(validateRedemption(input({ referrerRedemptionsLast30d: 20 }))).toMatchObject({ ok: false, reason: 'referrer_limit' });
    expect(validateRedemption(input({ referrerRedemptionsLast30d: 19 })).ok).toBe(true);
  });
});

describe('referral · sharing', () => {
  it('builds the invite URL from the web base and deep link', () => {
    expect(inviteUrl('https://dijitalasistan.app/', 'abcd 2345')).toBe('https://dijitalasistan.app/app/referral?code=ABCD2345');
  });

  it('builds natural Turkish and English share texts containing code and link', () => {
    const url = 'https://dijitalasistan.app/app/referral?code=ABCD2345';
    const tr = buildShareText({ code: 'ABCD2345', inviteUrl: url });
    expect(tr).toContain('ABCD2345 koduyla katıl, ikimiz de 14 gün Pro kazanalım.');
    expect(tr.endsWith(url)).toBe(true);
    const en = buildShareText({ code: 'ABCD2345', inviteUrl: url, locale: 'en' });
    expect(en).toContain('we both get 14 days of Pro');
  });

  it('encodes the WhatsApp share URL', () => {
    const u = whatsappShareUrl('Kod: ABCD2345\nhttps://dijitalasistan.app/app/referral?code=ABCD2345');
    expect(u.startsWith('https://wa.me/?text=')).toBe(true);
    expect(new URL(u).searchParams.get('text')).toContain('ABCD2345');
  });
});
