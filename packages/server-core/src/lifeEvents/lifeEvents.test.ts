import { describe, expect, it } from 'vitest';
import { lifeEventExtractionSchema } from '@da/validation';
import {
  extractLifeEvent,
  lifeEventActions,
  lifeEventDedupeKey,
  lifeEventEventAt,
  lifeEventStatus,
  lifeEventTitle,
  parseAmountNumber,
  senderOrgName,
  type ExtractedLifeEvent,
  type ExtractLifeEventInput,
} from './index';

// Friday 4 September 2026, 08:42 in Istanbul (UTC+3)
const now = '2026-09-04T05:42:00.000Z';
const tz = 'Europe/Istanbul';

type Fixture = Partial<ExtractLifeEventInput> & { subject: string; from: { name?: string | null; email: string }; bodyText?: string | null };

function extract(f: Fixture): ExtractedLifeEvent | null {
  return extractLifeEvent({ now, timezone: tz, ...f });
}

function must(f: Fixture): ExtractedLifeEvent {
  const r = extract(f);
  expect(r, `expected a life event for "${f.subject}"`).not.toBeNull();
  const parsed = lifeEventExtractionSchema.safeParse(r);
  expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.issues)).toBe(true);
  return r as ExtractedLifeEvent;
}

// --- seed fixtures (supabase/seed/seed.sql) --------------------------------------------------
const TRENDYOL: Fixture = {
  subject: 'Siparişin yola çıktı!',
  from: { name: 'Trendyol', email: 'info@trendyol.com' },
  bodyText: 'Siparişin Yurtiçi Kargo ile yola çıktı. Tahmini teslimat bugün 14:00–18:00. Takip no: 1234567890123',
};
const THY: Fixture = {
  subject: 'E-biletiniz: TK2412 İstanbul – Antalya',
  from: { name: 'Türk Hava Yolları', email: 'noreply@turkishairlines.com' },
  bodyText: 'Sayın Yunus Emre, TK2412 seferi yarın 09:15 İstanbul (IST) – 10:30 Antalya (AYT). PNR: ABC123. Online check-in açıldı: https://www.turkishairlines.com/tr-tr/ucak-bileti/online-check-in/',
};
const CK_ENERJI: Fixture = {
  subject: 'Elektrik faturanız hazır',
  from: { name: 'CK Enerji', email: 'fatura@ckenerji.com.tr' },
  bodyText: 'Eylül dönemi elektrik faturanız 1.842,00 TL. Son ödeme tarihi 10 Eylül.',
};
const NETFLIX: Fixture = {
  subject: 'Üyeliğiniz yenileniyor',
  from: { name: 'Netflix', email: 'info@mailer.netflix.com' },
  bodyText: "Netflix üyeliğiniz 9 Eylül'de yenilenecek. Aylık ücret 229,99 TL.",
};
const GOOGLE: Fixture = {
  subject: 'Yeni cihazdan giriş yapıldı',
  from: { name: 'Google', email: 'no-reply@accounts.google.com' },
  bodyText: 'Google hesabınıza yeni bir cihazdan (Windows, Ankara) giriş yapıldı. Siz değilseniz hesabınızı güvenceye alın.',
};

describe('lifeEvents · shipment', () => {
  it('Trendyol + Yurtiçi Kargo with a delivery window and a labelled tracking number', () => {
    const e = must(TRENDYOL);
    expect(e.type).toBe('shipment');
    expect(e.title).toBe('Trendyol siparişin bugün geliyor.');
    expect(e.details).toEqual({
      carrier: 'Yurtiçi Kargo',
      merchant: 'Trendyol',
      trackingNumber: '1234567890123',
      deliveryWindow: { start: '2026-09-04T11:00:00.000Z', end: '2026-09-04T15:00:00.000Z' },
    });
    expect(e.evidence.some((s) => s.includes('1234567890123'))).toBe(true);
    expect(e.evidence.some((s) => s.includes('14:00–18:00'))).toBe(true);
    expect(e.evidence.length).toBeLessThanOrEqual(8);
    expect(e.confidence).toBeGreaterThanOrEqual(0.85);
    expect(lifeEventStatus(e, now, tz)).toBe('today');
    expect(lifeEventEventAt(e)).toBe('2026-09-04T11:00:00.000Z');
    expect(lifeEventDedupeKey(e)).toBe('life:shipment:1234567890123');
    expect(lifeEventActions(e, 'tr')).toEqual([]); // no tracking link in the source → no track action
  });
  it('tracking link only when the source has one; number can come from the link', () => {
    const e = must({
      subject: 'Kargonuz dağıtıma çıktı',
      from: { name: 'Yurtiçi Kargo', email: 'bilgi@yurticikargo.com' },
      bodyText: 'Kargonuz dağıtıma çıktı. Takip: https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code=1234567890123',
    });
    expect(e.details.carrier).toBe('Yurtiçi Kargo');
    expect(e.details.merchant).toBeUndefined();
    expect(e.details.trackingNumber).toBe('1234567890123');
    expect(e.details.trackingUrl).toBe('https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code=1234567890123');
    expect(e.details.deliveryWindow).toBeUndefined();
    expect(e.title).toBe('Kargon yola çıktı.');
    expect(lifeEventActions(e, 'tr')).toEqual([{ kind: 'track', label: 'Takip Et', payload: { url: e.details.trackingUrl } }]);
    expect(lifeEventActions(e, 'en')[0]?.label).toBe('Track');
    expect(lifeEventStatus(e, now, tz)).toBe('upcoming');
  });
  it('English shipment with a UPS number and "arriving tomorrow"', () => {
    const e = must({
      subject: 'Your Amazon order has shipped',
      from: { name: 'Amazon.com', email: 'shipment-tracking@amazon.com' },
      bodyText: 'Your package is on its way with UPS. Tracking number: 1Z999AA10123456784. Arriving tomorrow.',
      locale: 'en',
    });
    expect(e.details.carrier).toBe('UPS');
    expect(e.details.merchant).toBe('Amazon');
    expect(e.details.trackingNumber).toBe('1Z999AA10123456784');
    expect(e.details.deliveryWindow?.start).toBe('2026-09-05T06:00:00.000Z');
    expect(e.details.deliveryWindow?.end).toBeNull();
    expect(e.title).toBe('Your Amazon order arrives tomorrow.');
    expect(lifeEventTitle(e, 'tr', { now, timezone: tz })).toBe('Amazon siparişin yarın geliyor.');
    expect(lifeEventTitle(e, 'tr')).toBe("Amazon siparişin 5 Eylül'de geliyor.");
    expect(lifeEventTitle(e, 'en')).toBe('Your Amazon order arrives on 5 September.');
  });
  it('delivered parcels are expired and titled accordingly', () => {
    const e = must({ subject: 'Kargonuz teslim edildi', from: { name: 'Trendyol', email: 'info@trendyol.com' }, bodyText: 'Siparişin teslim edildi. Takip no: 9876543210987' });
    expect(e.delivered).toBe(true);
    expect(e.title).toBe('Trendyol siparişin teslim edildi.');
    expect(lifeEventStatus(e, now, tz)).toBe('expired');
  });
  it('"kargo bedava" promotions and order confirmations without a shipment status are not shipments', () => {
    expect(
      extract({
        subject: '%40 indirim sadece bugün!',
        from: { name: 'Moda Mağazası', email: 'kampanya@moda.com' },
        bodyText: 'Sonbahar koleksiyonunda %40 indirim. 500 TL üzeri kargo bedava. Kaçırma!',
      }),
    ).toBeNull();
    expect(extract({ subject: 'Siparişiniz alındı', from: { name: 'Hepsiburada', email: 'siparis@hepsiburada.com' }, bodyText: 'Sipariş no: 123456789012. Teşekkürler.' })).toBeNull();
  });
});

describe('lifeEvents · flight', () => {
  it('THY TK2412 with route, departure/arrival, labelled PNR and check-in link', () => {
    const e = must(THY);
    expect(e.type).toBe('flight');
    expect(e.title).toBe('TK2412 · İstanbul → Antalya');
    expect(e.details).toEqual({
      flightNumber: 'TK2412',
      airline: 'THY',
      from: 'İstanbul (IST)',
      to: 'Antalya (AYT)',
      departureAt: '2026-09-05T06:15:00.000Z',
      arrivalAt: '2026-09-05T07:30:00.000Z',
      pnr: 'ABC123',
      checkInUrl: 'https://www.turkishairlines.com/tr-tr/ucak-bileti/online-check-in/',
    });
    expect(e.evidence.some((s) => s.includes('TK2412'))).toBe(true);
    expect(e.evidence.some((s) => s.includes('ABC123'))).toBe(true);
    expect(e.evidence.some((s) => s.includes('yarın 09:15'))).toBe(true);
    expect(e.confidence).toBeGreaterThanOrEqual(0.9);
    expect(lifeEventStatus(e, now, tz)).toBe('upcoming');
    expect(lifeEventDedupeKey(e)).toBe('life:flight:TK2412:2026-09-05');
    const actions = lifeEventActions(e, 'tr');
    expect(actions.map((a) => a.kind)).toEqual(['check_in', 'add_to_calendar']);
    expect(actions[0]?.label).toBe('Check-in');
    expect(actions[1]?.payload).toEqual({ title: 'TK2412 · İstanbul → Antalya', startAt: '2026-09-05T06:15:00.000Z', endAt: '2026-09-05T07:30:00.000Z' });
  });
  it('PNR is never guessed: an unlabelled 6-char token or a 6-digit code is not a PNR', () => {
    const e = must({ subject: 'Uçuş bilgileri TK2412', from: { name: 'THY', email: 'noreply@turkishairlines.com' }, bodyText: 'TK2412 uçuşunuz yarın 09:15 IST → AYT. Onay kodunuz: 482913. Referans XQ12AB.' });
    expect(e.details.pnr).toBeUndefined();
    expect(e.details.from).toBe('IST');
    expect(e.details.to).toBe('AYT');
    expect(e.title).toBe('TK2412 · IST → AYT');
    expect(lifeEventActions(e).map((a) => a.kind)).toEqual(['add_to_calendar']); // no check-in link
  });
  it('English Pegasus booking with a booking reference and an absolute date', () => {
    const e = must({
      subject: 'Your booking PC1234 Istanbul (SAW) → Izmir (ADB)',
      from: { name: 'Pegasus', email: 'noreply@flypgs.com' },
      bodyText: 'Flight PC1234 departs on 12 September 2026 at 07:45. Booking reference: XY7K2M. Check-in: https://www.flypgs.com/check-in',
      locale: 'en',
    });
    expect(e.details.flightNumber).toBe('PC1234');
    expect(e.details.airline).toBe('Pegasus');
    expect(e.details.from).toBe('Istanbul (SAW)');
    expect(e.details.to).toBe('Izmir (ADB)');
    expect(e.details.departureAt).toBe('2026-09-12T04:45:00.000Z');
    expect(e.details.pnr).toBe('XY7K2M');
    expect(e.details.checkInUrl).toBe('https://www.flypgs.com/check-in');
    expect(e.title).toBe('PC1234 · Istanbul → Izmir');
  });
  it('airline + city pair without a flight number still qualifies; a past flight is expired', () => {
    const e = must({ subject: 'Uçuşunuz yaklaşıyor', from: { name: 'THY', email: 'noreply@turkishairlines.com' }, bodyText: 'THY ile İstanbul – Antalya uçuşunuz 3 Eylül 2026 09:15.' });
    expect(e.details.flightNumber).toBeUndefined();
    expect(e.details.airline).toBe('THY');
    expect(e.title).toBe('THY · İstanbul → Antalya');
    expect(e.details.departureAt).toBe('2026-09-03T06:15:00.000Z');
    expect(lifeEventStatus(e, now, tz)).toBe('expired');
  });
});

describe('lifeEvents · payment', () => {
  it('CK Enerji electricity bill: amount with evidence, "son ödeme tarihi" deadline, payee from the sender', () => {
    const e = must(CK_ENERJI);
    expect(e.type).toBe('payment');
    expect(e.title).toBe('Elektrik faturası · 1.842 TL');
    expect(e.details).toEqual({ amount: 1842, currency: 'TRY', dueAt: '2026-09-10T15:00:00.000Z', payee: 'CK Enerji' });
    expect(e.billKind).toBe('electricity');
    expect(e.evidence.some((s) => s.includes('1.842,00 TL'))).toBe(true);
    expect(e.evidence.some((s) => s.includes('Son ödeme tarihi 10 Eylül'))).toBe(true);
    expect(lifeEventStatus(e, now, tz)).toBe('upcoming');
    expect(lifeEventEventAt(e)).toBe('2026-09-10T15:00:00.000Z');
    expect(lifeEventDedupeKey(e)).toBe('life:payment:ck-enerji:2026-09-10');
    expect(lifeEventTitle(e, 'en')).toBe('Electricity bill · 1,842 TL');
    expect(lifeEventActions(e, 'tr')).toEqual([{ kind: 'remind', label: 'Hatırlat', payload: { at: '2026-09-10T15:00:00.000Z' } }]);
  });
  it('a labelled payment link becomes open_link — never an in-app "pay" action', () => {
    const e = must({ ...CK_ENERJI, bodyText: `${CK_ENERJI.bodyText} Faturanızı ödemek için: https://www.ckbogazicielektrik.com.tr/online-islemler` });
    expect(e.details.paymentUrl).toBe('https://www.ckbogazicielektrik.com.tr/online-islemler');
    const actions = lifeEventActions(e, 'tr');
    expect(actions.map((a) => a.kind)).toEqual(['open_link', 'remind']);
    expect(actions.some((a) => a.kind === 'pay')).toBe(false);
    expect(actions[0]?.label).toBe('Faturayı Aç');
  });
  it('amount formats: "1.842 TL", "₺1.842", "229,99 TL", "1,842.50 USD"', () => {
    expect(parseAmountNumber('1.842,00')).toBe(1842);
    expect(parseAmountNumber('1.842')).toBe(1842);
    expect(parseAmountNumber('229,99')).toBe(229.99);
    expect(parseAmountNumber('1,842.50')).toBe(1842.5);
    expect(parseAmountNumber('1,842')).toBe(1842);
    expect(parseAmountNumber('49.99')).toBe(49.99);
    const lira = must({ subject: 'Su faturanız', from: { name: 'İSKİ', email: 'bilgi@iski.gov.tr' }, bodyText: 'Su faturanız ₺1.842 olarak tahakkuk etmiştir. Son ödeme günü 15 Eylül.' });
    expect(lira.details.amount).toBe(1842);
    expect(lira.details.currency).toBe('TRY');
    expect(lira.title).toBe('Su faturası · 1.842 TL');
    const usd = must({ subject: 'Invoice #4821', from: { name: 'Acme Cloud', email: 'billing@acmecloud.io' }, bodyText: 'Invoice total: 1,842.50 USD. Due by 10 September.', locale: 'en' });
    expect(usd.details.amount).toBe(1842.5);
    expect(usd.details.currency).toBe('USD');
    expect(usd.details.dueAt).toBe('2026-09-10T15:00:00.000Z');
    expect(usd.title).toBe('Acme Cloud bill · 1,842.50 USD');
  });
  it('a newsletter mentioning "%40 indirim 1.000 TL" and a payment receipt are not payments', () => {
    expect(
      extract({
        subject: 'Haftalık bülten: %40 indirim',
        from: { name: 'Moda Mağazası', email: 'bulten@moda.com' },
        bodyText: 'Bu hafta seçili ürünlerde %40 indirim, 1.000 TL üzeri alışverişlerde ödeme kolaylığı. Kaçırmayın!',
      }),
    ).toBeNull();
    expect(extract({ subject: 'Ödemeniz alındı', from: { name: 'Turkcell', email: 'bilgi@turkcell.com.tr' }, bodyText: 'Turkcell faturanız için 349,90 TL ödemeniz başarıyla alındı. Teşekkürler.' })).toBeNull();
  });
});

describe('lifeEvents · subscription', () => {
  it('Netflix renewal with date and monthly amount', () => {
    const e = must(NETFLIX);
    expect(e.type).toBe('subscription');
    expect(e.title).toBe("Netflix 9 Eylül'de yenileniyor.");
    expect(e.details).toEqual({ serviceName: 'Netflix', renewsAt: '2026-09-09T06:00:00.000Z', amount: 229.99, currency: 'TRY' });
    expect(e.evidence.some((s) => s.includes("9 Eylül'de"))).toBe(true);
    expect(e.evidence.some((s) => s.includes('229,99 TL'))).toBe(true);
    expect(lifeEventTitle(e, 'en', { now, timezone: tz })).toBe('Netflix renews on 9 September.');
    expect(lifeEventDedupeKey(e)).toBe('life:subscription:netflix:2026-09-09');
    expect(lifeEventStatus(e, now, tz)).toBe('upcoming');
    expect(lifeEventActions(e, 'en')).toEqual([{ kind: 'remind', label: 'Remind me', payload: { at: '2026-09-09T06:00:00.000Z' } }]);
  });
  it('English renewal from the sender with a USD price; renewal beats a generic bill', () => {
    const e = must({
      subject: 'Your Premium subscription renews soon',
      from: { name: 'Spotify', email: 'no-reply@spotify.com' },
      bodyText: 'Your Spotify Premium subscription renews on September 12, 2026 for $10.99. Payment will be charged to your card.',
      locale: 'en',
    });
    expect(e.type).toBe('subscription');
    expect(e.details.serviceName).toBe('Spotify');
    expect(e.details.renewsAt).toBe('2026-09-12T06:00:00.000Z');
    expect(e.details.amount).toBe(10.99);
    expect(e.details.currency).toBe('USD');
    expect(e.title).toBe('Spotify renews on 12 September.');
  });
  it('a subscription mail without a date or amount is not enough', () => {
    expect(extract({ subject: 'Aboneliğiniz hakkında', from: { name: 'Exxen', email: 'info@exxen.com' }, bodyText: 'Aboneliğinizle ilgili yeni özellikler ekledik.' })).toBeNull();
  });
});

describe('lifeEvents · security', () => {
  it('Google new-device sign-in with device and location', () => {
    const e = must(GOOGLE);
    expect(e.type).toBe('security');
    expect(e.title).toBe('Google hesabında yeni giriş.');
    expect(e.details).toEqual({ securityEvent: 'Yeni cihazdan giriş', device: 'Windows', location: 'Ankara' });
    expect(e.occurredAt).toBe(now);
    expect(e.evidence.some((s) => s.includes('Windows, Ankara'))).toBe(true);
    expect(e.confidence).toBeGreaterThanOrEqual(0.9);
    expect(lifeEventStatus(e, now, tz)).toBe('today');
    expect(lifeEventEventAt(e)).toBe(now);
    expect(lifeEventDedupeKey(e)).toBe('life:security:yeni-cihazdan-giris:google:2026-09-04');
    expect(lifeEventActions(e, 'tr')).toEqual([{ kind: 'open_original', label: 'Kaynağı Aç' }]);
    expect(lifeEventTitle(e, 'en')).toBe('New sign-in to your Google account.');
  });
  it('English new-device alert with a labelled location; password change from Apple', () => {
    const e = must({
      subject: 'New sign-in on Windows',
      from: { name: null, email: 'no-reply@accounts.google.com' },
      bodyText: 'Your Google Account was just signed in to from a new Windows device. Location: Berlin, Germany.',
      locale: 'en',
    });
    expect(e.details.securityEvent).toBe('Yeni cihazdan giriş');
    expect(e.details.device).toBe('Windows');
    expect(e.details.location).toBe('Berlin, Germany');
    expect(e.provider).toBe('Google');
    expect(e.title).toBe('New sign-in to your Google account.');
    const pw = must({ subject: 'Şifreniz değiştirildi', from: { name: 'Apple', email: 'noreply@email.apple.com' }, bodyText: 'Apple Hesabınızın şifresi değiştirildi. Bu siz değilseniz hemen bizimle iletişime geçin.' });
    expect(pw.details.securityEvent).toBe('Şifre değişikliği');
    expect(pw.title).toBe('Apple şifren değiştirildi.');
    expect(lifeEventTitle(pw, 'en')).toBe('Your Apple password was changed.');
  });
  it('one-time codes are transient, not life events', () => {
    expect(extract({ subject: 'Doğrulama kodunuz', from: { name: 'Google', email: 'no-reply@accounts.google.com' }, bodyText: 'Google doğrulama kodunuz: 482913. Kodu kimseyle paylaşmayın.' })).toBeNull();
  });
});

describe('lifeEvents · reservation', () => {
  it('restaurant reservation with date-time, party size and address', () => {
    const e = must({
      subject: 'Rezervasyonunuz onaylandı',
      from: { name: 'Nusr-Et Etiler', email: 'rezervasyon@nusr-et.com.tr' },
      bodyText: 'Nusr-Et Etiler rezervasyonunuz onaylandı. Tarih: 12 Eylül 2026, saat 20:00. 4 kişi. Adres: Nispetiye Cad. No:87 Etiler',
    });
    expect(e.type).toBe('reservation');
    expect(e.details).toEqual({ venue: 'Nusr-Et Etiler', address: 'Nispetiye Cad. No:87 Etiler', reservationAt: '2026-09-12T17:00:00.000Z', partySize: 4 });
    expect(e.title).toBe('Nusr-Et Etiler rezervasyonu · 12 Eylül 20:00');
    expect(lifeEventTitle(e, 'en', { now, timezone: tz })).toBe('Nusr-Et Etiler reservation · 12 September 20:00');
    expect(lifeEventDedupeKey(e)).toBe('life:reservation:nusr-et-etiler:2026-09-12');
    expect(lifeEventActions(e, 'tr')).toEqual([{ kind: 'add_to_calendar', label: 'Takvime Ekle', payload: { title: e.title, startAt: '2026-09-12T17:00:00.000Z' } }]);
    expect(lifeEventStatus(e, now, tz)).toBe('upcoming');
  });
  it('hotel booking uses the check-in date and the venue named in the text', () => {
    const e = must({
      subject: 'Booking confirmation – Hilton Istanbul Bosphorus Hotel',
      from: { name: 'Booking.com', email: 'noreply@booking.com' },
      bodyText: 'Your booking at Hilton Istanbul Bosphorus Hotel is confirmed. Check-in: 12 September 2026. Check-out: 14 September 2026. 2 adults. Address: Cumhuriyet Cad. 50, Istanbul',
      locale: 'en',
    });
    expect(e.details.venue).toBe('Hilton Istanbul Bosphorus Hotel');
    expect(e.details.reservationAt).toBe('2026-09-12T06:00:00.000Z');
    expect(e.details.partySize).toBe(2);
    expect(e.details.address).toBe('Cumhuriyet Cad. 50, Istanbul');
    expect(e.title).toBe('Hilton Istanbul Bosphorus Hotel reservation · 12 September 09:00');
  });
});

describe('lifeEvents · negatives, precedence and helpers', () => {
  it('a human request mail, an empty mail and an invalid reference instant yield null', () => {
    expect(
      extract({
        subject: 'Revize teklif',
        from: { name: 'Ahmet Yılmaz', email: 'ahmet@firma.com' },
        bodyText: "Merhaba Yunus,\n\nDünkü görüşmemize istinaden revize fiyat teklifini bugün saat 17:00'ye kadar PDF formatında iletebilir misin?\n\nTeşekkürler,\nAhmet",
      }),
    ).toBeNull();
    expect(extract({ subject: '', from: { name: null, email: 'x@y.com' }, bodyText: '' })).toBeNull();
    expect(extractLifeEvent({ ...TRENDYOL, now: 'not-a-date', timezone: tz })).toBeNull();
  });
  it('security beats commerce; flights beat reservations; quoted history is ignored', () => {
    const sec = must({ ...GOOGLE, bodyText: `${GOOGLE.bodyText} Trendyol siparişiniz yola çıktı, takip no 1234567890123.` });
    expect(sec.type).toBe('security');
    const flight = must({ ...THY, bodyText: `${THY.bodyText} Rezervasyonunuz için teşekkürler.` });
    expect(flight.type).toBe('flight');
    const quoted = extract({ subject: 'Re: Siparişin yola çıktı!', from: { name: 'Yunus', email: 'yunus@example.com' }, bodyText: 'Teşekkürler.\n\nOn Fri, Sep 4 Trendyol wrote:\n> Siparişin yola çıktı. Takip no: 1234567890123' });
    expect(quoted).toBeNull();
  });
  it('every positive result validates against lifeEventExtractionSchema with bounded evidence', () => {
    for (const f of [TRENDYOL, THY, CK_ENERJI, NETFLIX, GOOGLE]) {
      const e = must(f);
      expect(e.title.length).toBeLessThanOrEqual(120);
      expect(e.evidence.length).toBeGreaterThan(0);
      expect(e.evidence.every((s) => s.length <= 240)).toBe(true);
      expect(e.confidence).toBeGreaterThan(0);
      expect(e.confidence).toBeLessThanOrEqual(1);
    }
  });
  it('senderOrgName prefers the display name and falls back to known brands', () => {
    expect(senderOrgName({ name: 'CK Enerji', email: 'fatura@ckenerji.com.tr' })).toBe('CK Enerji');
    expect(senderOrgName({ name: null, email: 'no-reply@accounts.google.com' })).toBe('Google');
    expect(senderOrgName({ name: 'noreply', email: 'noreply@mailer.netflix.com' })).toBe('Netflix');
    expect(senderOrgName({ name: 'Trendyol Bildirim', email: 'info@trendyol.com' })).toBe('Trendyol');
    expect(senderOrgName({ name: null, email: 'bilgi@ornekfirma.com' })).toBe('Ornekfirma');
  });
  it('lifeEventStatus and lifeEventEventAt without a date', () => {
    const e = must({ subject: 'Kargonuz yola çıktı', from: { name: 'Aras Kargo', email: 'bilgi@araskargo.com.tr' }, bodyText: 'Gönderiniz yola çıktı. Takip numaranız: 2233445566778' });
    expect(lifeEventEventAt(e)).toBeNull();
    expect(lifeEventStatus(e, now, tz)).toBe('upcoming');
    expect(lifeEventDedupeKey(e)).toBe('life:shipment:2233445566778');
  });
});
