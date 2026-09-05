/** Titles, suggested actions, status, event instant and dedupe keys for life events (Turkish + English). */
import type { LifeEventExtraction, Locale, SuggestedAction } from '@da/domain';
import { MONTHS_EN_TITLE, MONTHS_TR_TITLE, formatDateLabel, formatDateLocative, localDateOf, localDateTimeOf, pad2, turkishLocative } from '../dates';
import { localDateKey, truncate } from '../util';
import { formatAmount, slug } from './common';
import type { BillKind, ExtractedLifeEvent, LifeEventStatusValue, LifeEventTitleOptions } from './types';

const DEFAULT_TZ = 'Europe/Istanbul';
const MAX_TITLE = 120;

/** Anything shaped like the extraction — stored rows only carry `details`, so the extras are optional. */
export type LifeEventLike = LifeEventExtraction & Partial<Pick<ExtractedLifeEvent, 'evidence' | 'occurredAt' | 'provider' | 'delivered' | 'billKind'>>;

function timezoneOf(opts: LifeEventTitleOptions): string {
  return opts.timezone ?? DEFAULT_TZ;
}

/** "bugün" / "yarın" / "9 Eylül'de" (relative when `now` is known, absolute otherwise). */
function whenLabel(iso: string, locale: Locale, opts: LifeEventTitleOptions, withTime = false): string {
  const timezone = timezoneOf(opts);
  if (opts.now && !Number.isNaN(Date.parse(opts.now))) return formatDateLocative(iso, { now: opts.now, timezone, locale, withTime });
  const d = localDateOf(iso, timezone);
  const time = withTime ? ` ${clock(iso, timezone)}` : '';
  if (locale === 'tr') return `${turkishLocative(`${d.d} ${MONTHS_TR_TITLE[d.m - 1] ?? ''}`)}${time}`;
  return `on ${d.d} ${MONTHS_EN_TITLE[d.m - 1] ?? ''}${time}`;
}

/** "yarın 20:00" / "12 Eylül 20:00" for reservations and flights. */
function dayTimeLabel(iso: string, locale: Locale, opts: LifeEventTitleOptions, withTime: boolean): string {
  const timezone = timezoneOf(opts);
  if (opts.now && !Number.isNaN(Date.parse(opts.now))) return formatDateLabel(iso, { now: opts.now, timezone, locale, withTime });
  const d = localDateOf(iso, timezone);
  const month = locale === 'tr' ? MONTHS_TR_TITLE[d.m - 1] : MONTHS_EN_TITLE[d.m - 1];
  return `${d.d} ${month ?? ''}${withTime ? ` ${clock(iso, timezone)}` : ''}`;
}

function clock(iso: string, timezone: string): string {
  const t = localDateTimeOf(iso, timezone);
  return `${pad2(t.hh)}:${pad2(t.mm)}`;
}

/** "İstanbul (IST)" → "İstanbul"; "IST" stays. */
function cityOf(s: string): string {
  return s.replace(/\s*\([A-Z]{3}\)\s*$/u, '').trim() || s;
}

const BILL_LABELS: Record<Locale, Record<BillKind, string>> = {
  tr: {
    electricity: 'Elektrik faturası',
    water: 'Su faturası',
    gas: 'Doğalgaz faturası',
    internet: 'İnternet faturası',
    phone: 'Telefon faturası',
    credit_card: 'Kredi kartı ekstresi',
    dues: 'Aidat',
    rent: 'Kira',
    insurance: 'Sigorta ödemesi',
    tax: 'Vergi ödemesi',
    school: 'Okul ücreti',
  },
  en: {
    electricity: 'Electricity bill',
    water: 'Water bill',
    gas: 'Gas bill',
    internet: 'Internet bill',
    phone: 'Phone bill',
    credit_card: 'Credit card statement',
    dues: 'Dues',
    rent: 'Rent',
    insurance: 'Insurance payment',
    tax: 'Tax payment',
    school: 'Tuition',
  },
};

function securityTitle(event: string | null | undefined, service: string | null, locale: Locale): string {
  const s = service ?? null;
  const tr = (withService: string, without: string): string => (s ? `${s} ${withService}` : without);
  const en = (withService: string, without: string): string => (s ? withService.replace('{s}', s) : without);
  switch (event) {
    case 'Şüpheli giriş':
      return locale === 'tr' ? tr('hesabında şüpheli giriş.', 'Hesabında şüpheli giriş.') : en('Suspicious sign-in to your {s} account.', 'Suspicious sign-in to your account.');
    case 'Şifre değişikliği':
      return locale === 'tr' ? tr('şifren değiştirildi.', 'Şifren değiştirildi.') : en('Your {s} password was changed.', 'Your password was changed.');
    case 'Şifre sıfırlandı':
      return locale === 'tr' ? tr('şifren sıfırlandı.', 'Şifren sıfırlandı.') : en('Your {s} password was reset.', 'Your password was reset.');
    case 'İki adımlı doğrulama':
      return locale === 'tr' ? tr('iki adımlı doğrulama ayarın değişti.', 'İki adımlı doğrulama ayarın değişti.') : en('{s} two-step verification changed.', 'Two-step verification changed.');
    case 'Kurtarma bilgisi değişti':
      return locale === 'tr' ? tr('kurtarma bilgin değişti.', 'Kurtarma bilgin değişti.') : en('{s} recovery info changed.', 'Recovery info changed.');
    case 'Yeni cihazdan giriş':
    case 'Yeni giriş':
      return locale === 'tr' ? tr('hesabında yeni giriş.', 'Hesabında yeni giriş.') : en('New sign-in to your {s} account.', 'New sign-in to your account.');
    default:
      return locale === 'tr' ? tr('güvenlik uyarısı.', 'Güvenlik uyarısı.') : en('{s} security alert.', 'Security alert.');
  }
}

/** Natural one-line title: "Trendyol siparişin bugün geliyor.", "TK2412 · İstanbul → Antalya", "Elektrik faturası · 1.842 TL". */
export function lifeEventTitle(extraction: LifeEventLike, locale: Locale = 'tr', opts: LifeEventTitleOptions = {}): string {
  const d = extraction.details;
  const tr = locale === 'tr';
  let title: string;
  switch (extraction.type) {
    case 'shipment': {
      const subject = tr ? (d.merchant ? `${d.merchant} siparişin` : 'Kargon') : d.merchant ? `Your ${d.merchant} order` : 'Your parcel';
      if (extraction.delivered) title = tr ? `${subject} teslim edildi.` : `${subject} was delivered.`;
      else if (d.deliveryWindow?.start) title = tr ? `${subject} ${whenLabel(d.deliveryWindow.start, locale, opts)} geliyor.` : `${subject} arrives ${whenLabel(d.deliveryWindow.start, locale, opts)}.`;
      else title = tr ? `${subject} yola çıktı.` : `${subject} has shipped.`;
      break;
    }
    case 'flight': {
      const label = d.flightNumber ?? d.airline ?? (tr ? 'Uçuş' : 'Flight');
      if (d.from && d.to) title = `${label} · ${cityOf(d.from)} → ${cityOf(d.to)}`;
      else if (d.departureAt) title = `${label} ${tr ? 'uçuşu' : 'flight'} · ${dayTimeLabel(d.departureAt, locale, opts, true)}`;
      else title = `${label} ${tr ? 'uçuşu' : 'flight'}`;
      break;
    }
    case 'reservation': {
      const head = d.venue ? `${d.venue} ${tr ? 'rezervasyonu' : 'reservation'}` : tr ? 'Rezervasyon' : 'Reservation';
      title = d.reservationAt ? `${head} · ${dayTimeLabel(d.reservationAt, locale, opts, true)}` : head;
      break;
    }
    case 'payment': {
      const kind = extraction.billKind ? BILL_LABELS[locale][extraction.billKind] : d.payee ? (tr ? `${d.payee} faturası` : `${d.payee} bill`) : tr ? 'Fatura' : 'Bill';
      if (typeof d.amount === 'number' && d.currency) title = `${kind} · ${formatAmount(d.amount, d.currency, locale)}`;
      else if (d.dueAt) title = tr ? `${kind} · son ödeme ${dayTimeLabel(d.dueAt, locale, opts, false)}` : `${kind} · due ${dayTimeLabel(d.dueAt, locale, opts, false)}`;
      else title = kind;
      break;
    }
    case 'subscription': {
      const service = d.serviceName ?? extraction.provider ?? (tr ? 'Abonelik' : 'Subscription');
      if (d.renewsAt) title = tr ? `${service} ${whenLabel(d.renewsAt, locale, opts)} yenileniyor.` : `${service} renews ${whenLabel(d.renewsAt, locale, opts)}.`;
      else title = tr ? `${service} aboneliğin yenileniyor.` : `Your ${service} subscription renews.`;
      break;
    }
    case 'security':
      title = securityTitle(d.securityEvent, extraction.provider ?? null, locale);
      break;
  }
  return truncate(title, MAX_TITLE);
}

/** Instant the event is about: delivery start, departure, reservation, due date, renewal or (security) the observation time. */
export function lifeEventEventAt(extraction: LifeEventLike): string | null {
  const d = extraction.details;
  switch (extraction.type) {
    case 'shipment':
      return d.deliveryWindow?.start ?? (extraction.delivered ? (extraction.occurredAt ?? null) : null);
    case 'flight':
      return d.departureAt ?? null;
    case 'reservation':
      return d.reservationAt ?? null;
    case 'payment':
      return d.dueAt ?? null;
    case 'subscription':
      return d.renewsAt ?? null;
    case 'security':
      return extraction.occurredAt ?? null;
  }
}

const ACTION_LABELS: Record<Locale, Record<'track' | 'check_in' | 'add_to_calendar' | 'open_link' | 'remind' | 'open_original', string>> = {
  tr: { track: 'Takip Et', check_in: 'Check-in', add_to_calendar: 'Takvime Ekle', open_link: 'Faturayı Aç', remind: 'Hatırlat', open_original: 'Kaynağı Aç' },
  en: { track: 'Track', check_in: 'Check-in', add_to_calendar: 'Add to calendar', open_link: 'Open bill', remind: 'Remind me', open_original: 'Open source' },
};

/**
 * Suggested actions — only for links the source actually contains. Payments are never paid in-app
 * (open_link at most); security alerts always point back to the original message.
 */
export function lifeEventActions(extraction: LifeEventLike, locale: Locale = 'tr'): SuggestedAction[] {
  const d = extraction.details;
  const labels = ACTION_LABELS[locale];
  const out: SuggestedAction[] = [];
  switch (extraction.type) {
    case 'shipment':
      if (d.trackingUrl) out.push({ kind: 'track', label: labels.track, payload: { url: d.trackingUrl } });
      break;
    case 'flight':
      if (d.checkInUrl) out.push({ kind: 'check_in', label: labels.check_in, payload: { url: d.checkInUrl } });
      if (d.departureAt) {
        out.push({
          kind: 'add_to_calendar',
          label: labels.add_to_calendar,
          payload: { title: lifeEventTitle(extraction, locale), startAt: d.departureAt, ...(d.arrivalAt ? { endAt: d.arrivalAt } : {}) },
        });
      }
      break;
    case 'reservation':
      if (d.reservationAt) out.push({ kind: 'add_to_calendar', label: labels.add_to_calendar, payload: { title: lifeEventTitle(extraction, locale), startAt: d.reservationAt } });
      break;
    case 'payment':
      if (d.paymentUrl) out.push({ kind: 'open_link', label: labels.open_link, payload: { url: d.paymentUrl } });
      if (d.dueAt) out.push({ kind: 'remind', label: labels.remind, payload: { at: d.dueAt } });
      break;
    case 'subscription':
      if (d.renewsAt) out.push({ kind: 'remind', label: labels.remind, payload: { at: d.renewsAt } });
      break;
    case 'security':
      out.push({ kind: 'open_original', label: labels.open_original });
      break;
  }
  return out;
}

/** today / upcoming / expired relative to `now` in the user's timezone; delivered shipments are expired. */
export function lifeEventStatus(extraction: LifeEventLike, now: string, timezone: string): LifeEventStatusValue {
  if (extraction.type === 'shipment' && extraction.delivered) return 'expired';
  const at = lifeEventEventAt(extraction);
  if (!at || Number.isNaN(Date.parse(at))) return extraction.type === 'security' ? 'today' : 'upcoming';
  const eventDay = localDateKey(at, timezone);
  const today = localDateKey(now, timezone);
  if (eventDay === today) return 'today';
  return eventDay > today ? 'upcoming' : 'expired';
}

/**
 * Stable key so re-analysing the same mail (or a follow-up mail about the same shipment / flight /
 * bill) never duplicates a life event: tracking number, flight+date, payee+due, service+renewal,
 * security event+provider+day.
 */
export function lifeEventDedupeKey(extraction: LifeEventLike, opts: { timezone?: string } = {}): string {
  const timezone = opts.timezone ?? DEFAULT_TZ;
  const day = (iso: string | null | undefined): string => (iso && !Number.isNaN(Date.parse(iso)) ? localDateKey(iso, timezone) : '');
  const d = extraction.details;
  const parts: string[] = ['life', extraction.type];
  switch (extraction.type) {
    case 'shipment':
      if (d.trackingNumber) parts.push(d.trackingNumber);
      else parts.push(slug(d.merchant ?? d.carrier ?? extraction.provider ?? 'kargo'), day(d.deliveryWindow?.start));
      break;
    case 'flight':
      parts.push(d.flightNumber ?? slug(d.airline ?? extraction.provider ?? 'ucus'), day(d.departureAt));
      break;
    case 'reservation':
      parts.push(slug(d.venue ?? extraction.provider ?? 'rezervasyon'), day(d.reservationAt));
      break;
    case 'payment':
      parts.push(slug(d.payee ?? extraction.provider ?? 'odeme'), day(d.dueAt) || (typeof d.amount === 'number' ? String(d.amount) : ''));
      break;
    case 'subscription':
      parts.push(slug(d.serviceName ?? extraction.provider ?? 'abonelik'), day(d.renewsAt));
      break;
    case 'security':
      parts.push(slug(d.securityEvent ?? 'guvenlik'), slug(extraction.provider ?? ''), day(extraction.occurredAt));
      break;
  }
  return parts.filter((p) => p !== '').join(':');
}
