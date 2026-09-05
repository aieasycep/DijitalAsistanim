import { describe, expect, it } from 'vitest';
import type { PriorityRule, VipPerson } from '@da/domain';
import { isAutomatedSender, isNoReplyAddress, isSecuritySender, isSensitiveNotification, shouldSendToAi, triageEmail, type TriageEmailInput } from './index';

const now = '2026-09-04T05:42:00.000Z'; // Friday 08:42 Istanbul
const ctxBase = { now, timezone: 'Europe/Istanbul' as const };

type MailFixture = Omit<Partial<TriageEmailInput>, 'from' | 'subject'> & { from: string; subject: string };

function mail(partial: MailFixture): TriageEmailInput {
  const { from, subject, ...rest } = partial;
  return {
    from: { email: from, name: from.split('@')[0] ?? null },
    subject,
    snippet: rest.snippet ?? '',
    labels: rest.labels ?? ['INBOX'],
    isFromUser: rest.isFromUser ?? false,
    hasAttachments: rest.hasAttachments ?? false,
    ...rest,
  };
}

function rule(type: PriorityRule['type'], value: string, label: string, position = 0): PriorityRule {
  return { id: `rule-${type}-${value}`, userId: 'u1', type, value, label, enabled: true, position, createdAt: now, updatedAt: now };
}

function vip(displayName: string, email: string | null): VipPerson {
  return { id: `vip-${displayName}`, userId: 'u1', displayName, email, contactId: null, relation: null, notifyAlways: true, createdAt: now, updatedAt: now };
}

describe('triage · stage 1 provider labels and sender shape', () => {
  it('spam and trash are skipped', () => {
    expect(triageEmail(mail({ from: 'x@spam.com', subject: 'Kazandınız!', labels: ['SPAM'] }), ctxBase).bucket).toBe('skip');
    expect(triageEmail(mail({ from: 'x@firma.com', subject: 'Eski', labels: ['TRASH'] }), ctxBase).bucket).toBe('skip');
  });
  it('promotions with subject heuristics land in low with a Turkish reason', () => {
    const r = triageEmail(mail({ from: 'kampanya@e.trendyol.com', subject: 'Sana özel %50 indirim! Kampanya bugün son', labels: ['CATEGORY_PROMOTIONS'] }), ctxBase);
    expect(r.bucket).toBe('low');
    expect(r.preCategory).toBe('promotion');
    expect(r.needsAi).toBe(false);
    expect(r.reasons).toContain('Kampanya / reklam içeriği');
    expect(r.signals.promoSubject).toBe(true);
  });
  it('newsletters (List-Unsubscribe / Precedence: bulk) are low even from a human-looking address', () => {
    const a = triageEmail(mail({ from: 'ayse@haberbulteni.com', subject: 'Haftalık bülten #42', listUnsubscribe: '<mailto:unsub@haberbulteni.com>' }), ctxBase);
    expect(a.bucket).toBe('low');
    expect(a.signals.newsletter).toBe(true);
    const b = triageEmail(mail({ from: 'team@product.io', subject: 'What is new this week', precedence: 'bulk' }), { ...ctxBase, locale: 'en' });
    expect(b.bucket).toBe('low');
    expect(b.reasons).toContain('Newsletter / bulk mail');
  });
  it('social/updates labels are low unless a rule-level signal hits', () => {
    const social = triageEmail(mail({ from: 'notification@facebookmail.com', subject: 'Ahmet fotoğrafını beğendi', labels: ['CATEGORY_SOCIAL'] }), ctxBase);
    expect(social.bucket).toBe('low');
    const updates = triageEmail(mail({ from: 'no-reply@service.com', subject: 'Haftalık özetiniz hazır', labels: ['CATEGORY_UPDATES'] }), ctxBase);
    expect(updates.bucket).toBe('low');
    const shipment = triageEmail(
      mail({ from: 'bilgi@yurticikargo.com', subject: 'Kargonuz dağıtıma çıktı', snippet: 'Takip numarası: 1234567890123', labels: ['CATEGORY_UPDATES'] }),
      ctxBase,
    );
    expect(shipment.bucket).toBe('rules');
    expect(shipment.preCategory).toBe('shipment');
  });
  it('known automated senders are recognised, security senders are not skipped', () => {
    expect(isAutomatedSender('notifications@github.com')).toBe(true);
    expect(isAutomatedSender('someone@mail.linkedin.com')).toBe(true);
    expect(isAutomatedSender('ahmet@firma.com.tr')).toBe(false);
    expect(isNoReplyAddress('no-reply@accounts.google.com')).toBe(true);
    expect(isNoReplyAddress('bildirim@bank.com.tr')).toBe(true);
    expect(isNoReplyAddress('ahmet.yilmaz@firma.com')).toBe(false);
    expect(isSecuritySender('no-reply@accounts.google.com')).toBe(true);
    const r = triageEmail(
      mail({ from: 'no-reply@accounts.google.com', subject: 'Güvenlik uyarısı', snippet: 'Google Hesabınıza yeni bir cihazdan giriş yapıldı: Chrome, Windows, İstanbul.' }),
      ctxBase,
    );
    expect(r.bucket).toBe('rules');
    expect(r.fastPath).toBe('security');
    expect(r.preCategory).toBe('security');
    expect(r.preImportance).toBe('critical');
  });
  it('out-of-office auto replies are skipped', () => {
    const r = triageEmail(mail({ from: 'mehmet@firma.com', subject: 'Otomatik yanıt: Teklif', autoSubmitted: 'auto-replied' }), ctxBase);
    expect(r.bucket).toBe('skip');
  });
});

describe('triage · stage 2 rules and signals', () => {
  it('mute_sender / mute_domain rules skip the mail, but security mail still passes', () => {
    const rules = [rule('mute_domain', 'spamly.io', 'spamly.io'), rule('mute_sender', 'bot@firma.com', 'bot')];
    expect(triageEmail(mail({ from: 'news@spamly.io', subject: 'Merhaba' }), { ...ctxBase, rules }).bucket).toBe('skip');
    const muted = triageEmail(mail({ from: 'bot@firma.com', subject: 'Rapor' }), { ...ctxBase, rules });
    expect(muted.bucket).toBe('skip');
    expect(muted.reasons[0]).toBe('Kuralın: bot sessize alınmış');
    const sec = triageEmail(mail({ from: 'bot@firma.com', subject: 'Şifreniz değiştirildi' }), { ...ctxBase, rules });
    expect(sec.bucket).toBe('rules');
    expect(sec.fastPath).toBe('security');
  });
  it('VIP sender goes to ai with high importance and a VIP reason', () => {
    const r = triageEmail(mail({ from: 'ahmet@musteri.com', subject: 'Teklif hakkında' }), { ...ctxBase, vips: [vip('Ahmet Yılmaz', 'ahmet@musteri.com')] });
    expect(r.bucket).toBe('ai');
    expect(r.preImportance).toBe('high');
    expect(r.reasons).toContain('VIP: Ahmet Yılmaz');
    expect(r.vipName).toBe('Ahmet Yılmaz');
  });
  it('explicit important rules beat promotional context', () => {
    const r = triageEmail(mail({ from: 'kampanya@bank.com.tr', subject: '%20 indirim fırsatı', labels: ['CATEGORY_PROMOTIONS'] }), {
      ...ctxBase,
      rules: [rule('domain_important', 'bank.com.tr', 'Bankadan gelenler önemli')],
    });
    expect(r.bucket).toBe('ai');
    expect(r.reasons[0]).toBe('Kuralın: Bankadan gelenler önemli');
    expect(r.matchedRuleIds).toHaveLength(1);
  });
  it('keyword_low and promotions_low rules push mail to low', () => {
    const r = triageEmail(mail({ from: 'hr@firma.com', subject: 'Haftalık yemek listesi' }), { ...ctxBase, rules: [rule('keyword_low', 'yemek listesi', 'Yemek listesi')] });
    expect(r.bucket).toBe('low');
    expect(r.reasons[0]).toBe('Kuralın: Yemek listesi düşük öncelikli');
  });
  it('deadline terms from a human sender produce an evidence-backed deadline and a natural reason', () => {
    const r = triageEmail(
      mail({
        from: 'ahmet@musteri.com',
        subject: 'Revize teklif',
        snippet: 'Yönetim bugün saat 17:00\'ye kadar güncellenmiş fiyatı PDF olarak görmek istiyor.',
        sentAt: now,
      }),
      ctxBase,
    );
    expect(r.bucket).toBe('ai');
    expect(r.preCategory).toBe('deadline');
    expect(r.preImportance).toBe('high');
    expect(r.deadline?.iso).toBe('2026-09-04T14:00:00.000Z');
    expect(r.deadline?.evidence).toContain("17:00'ye kadar");
    expect(r.reasons).toContain("Son tarih var: bugün 17:00'ye kadar");
  });
  it('meeting terms are detected (Turkish and English)', () => {
    expect(triageEmail(mail({ from: 'mehmet@firma.com', subject: 'Yarınki toplantı için gündem' }), ctxBase).preCategory).toBe('meeting');
    expect(triageEmail(mail({ from: 'lisa@partner.com', subject: 'Zoom invite: Q4 planning' }), ctxBase).signals.meeting).toBe(true);
    const cal = triageEmail(mail({ from: 'calendar-notification@google.com', subject: 'Davet: Müşteri toplantısı @ Per 10 Eyl 2026 14:00' }), ctxBase);
    expect(cal.bucket).toBe('rules');
    expect(cal.preCategory).toBe('meeting');
  });
  it('finance, travel and shipment notifications from automated senders take the rules bucket', () => {
    const invoice = triageEmail(
      mail({ from: 'bildirim@ckenerji.com.tr', subject: 'Eylül ayı elektrik faturanız', snippet: 'Fatura tutarı 1.842,50 TL. Son ödeme tarihi 10 Eylül 2026.', sentAt: now }),
      ctxBase,
    );
    expect(invoice.bucket).toBe('rules');
    expect(invoice.preCategory).toBe('payment');
    expect(invoice.deadline?.iso).toBe('2026-09-10T15:00:00.000Z');
    const flight = triageEmail(mail({ from: 'noreply@thy.com', subject: 'E-biletiniz: TK2412 İstanbul - Antalya', snippet: 'PNR: ABC123' }), ctxBase);
    expect(flight.bucket).toBe('rules');
    expect(flight.preCategory).toBe('travel');
    const ship = triageEmail(mail({ from: 'info@trendyolmail.com', subject: 'Siparişin kargoya verildi', snippet: 'Yurtiçi Kargo takip numarası 987654321' }), ctxBase);
    expect(ship.preCategory).toBe('shipment');
    expect(ship.reasons).toContain('Kargo / sipariş bildirimi');
  });
  it('a plain human email goes to ai with the generic reason', () => {
    const r = triageEmail(mail({ from: 'elif@firma.com', subject: 'Selam', snippet: 'Bugün öğlen yemeğe çıkalım mı?' }), ctxBase);
    expect(r.bucket).toBe('ai');
    expect(r.needsAi).toBe(true);
    expect(r.reasons).toContain('Gerçek bir kişiden; AI analizi gerekiyor');
    expect(r.preCategory).toBeUndefined();
  });
  it('mail sent by the user is handled by rules (follow-up watching), asking mails become waiting_for_other', () => {
    const r = triageEmail(mail({ from: 'me@firma.com', subject: 'Teklif', snippet: 'Ekte teklif var, görüşünüzü bekliyorum.', isFromUser: true }), ctxBase);
    expect(r.bucket).toBe('rules');
    expect(r.needsAi).toBe(false);
    expect(r.preCategory).toBe('waiting_for_other');
    const info = triageEmail(mail({ from: 'me@firma.com', subject: 'Bilgi', snippet: 'Tamam, not aldım.', isFromUser: true }), ctxBase);
    expect(info.preCategory).toBe('information');
  });
  it('OTP mails take the security fast path with low importance; password change is critical', () => {
    const otp = triageEmail(mail({ from: 'noreply@bank.com.tr', subject: 'Doğrulama kodunuz', snippet: 'Kodunuz: 482193. Kimseyle paylaşmayın.' }), ctxBase);
    expect(otp.bucket).toBe('rules');
    expect(otp.preCategory).toBe('security');
    expect(otp.preImportance).toBe('low');
    expect(otp.reasons[0]).toBe('Doğrulama kodu — geçici içerik');
    const pw = triageEmail(mail({ from: 'account-security-noreply@accountprotection.microsoft.com', subject: 'Your password was changed' }), { ...ctxBase, locale: 'en' });
    expect(pw.preImportance).toBe('critical');
    expect(pw.reasons[0]).toBe('Security alert: account activity');
  });
  it('a weak "şifre" mention from a human does not trigger the fast path', () => {
    const r = triageEmail(mail({ from: 'elif@firma.com', subject: 'Wifi şifresi', snippet: 'Ofis wifi şifresi değişti, yarın söylerim.' }), ctxBase);
    expect(r.bucket).toBe('ai');
    expect(r.fastPath).toBeNull();
    expect(r.signals.security).toBe(true);
    expect(r.signals.securityStrong).toBe(false);
  });
  it('shouldSendToAi respects analyzed fingerprints', () => {
    const r = triageEmail(mail({ from: 'elif@firma.com', subject: 'Selam' }), ctxBase);
    expect(shouldSendToAi(r, false)).toBe(true);
    expect(shouldSendToAi(r, true)).toBe(false);
    expect(shouldSendToAi({ needsAi: false, bucket: 'rules' }, false)).toBe(false);
  });
  it('quoted history in bodies is ignored for signals', () => {
    const r = triageEmail(
      mail({
        from: 'elif@firma.com',
        subject: 'Re: Plan',
        snippet: 'Tamam.',
        bodyText: 'Tamam.\n\nOn Fri, Sep 4 Ahmet wrote:\n> Lütfen 10 Eylül\'e kadar gönder',
      }),
      ctxBase,
    );
    expect(r.deadline).toBeNull();
  });
});

describe('triage · Android notification privacy guard', () => {
  it('excludes authenticator and password manager packages', () => {
    expect(isSensitiveNotification({ packageName: 'com.google.android.apps.authenticator2', title: 'Google', text: '123 456' })).toEqual({ sensitive: true, reason: 'excluded_package' });
    expect(isSensitiveNotification({ packageName: 'com.x8bit.bitwarden', title: 'Bitwarden', text: 'Autofill' }).reason).toBe('excluded_package');
    expect(isSensitiveNotification({ packageName: 'com.microsoft.authenticator', title: 'Approve sign-in?', text: '' }).sensitive).toBe(true);
    expect(isSensitiveNotification({ packageName: 'org.example.myauthenticator', title: 'x', text: 'y' }).reason).toBe('excluded_package');
  });
  it('detects OTP codes in Turkish and English SMS-style notifications', () => {
    expect(isSensitiveNotification({ packageName: 'com.google.android.apps.messaging', title: 'BANKAM', text: 'Doğrulama kodunuz: 482193. Kimseyle paylaşmayın.' })).toEqual({ sensitive: true, reason: 'otp' });
    expect(isSensitiveNotification({ packageName: 'com.whatsapp', title: 'WhatsApp', text: 'Your WhatsApp code is 123-456' }).reason).toBe('otp');
    expect(isSensitiveNotification({ packageName: 'com.android.messaging', title: 'Trendyol', text: 'Giriş kodun 5521' }).reason).toBe('otp');
  });
  it('does not flag order/tracking numbers or ordinary messages', () => {
    expect(isSensitiveNotification({ packageName: 'com.trendyol', title: 'Trendyol', text: 'Sipariş kodun 48213 kargoya verildi' }).sensitive).toBe(false);
    expect(isSensitiveNotification({ packageName: 'com.whatsapp', title: 'Ahmet', text: 'Yarın 14:00 uygun mu?' }).sensitive).toBe(false);
    expect(isSensitiveNotification({ packageName: 'com.yurticikargo', title: 'Yurtiçi', text: 'Takip no 1234567890 dağıtımda' }).sensitive).toBe(false);
  });
  it('flags credential disclosures and honours custom package lists', () => {
    expect(isSensitiveNotification({ packageName: 'com.example', title: 'Hesap', text: 'Şifreniz: abc123' }).reason).toBe('credential');
    expect(isSensitiveNotification({ packageName: 'com.mybank', title: 'x', text: 'y' }, { excludedPackages: ['com.mybank'] }).reason).toBe('excluded_package');
  });
});
