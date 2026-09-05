/** Shipments: carrier, merchant, tracking number / URL, delivery window — promotions mentioning "kargo bedava" are not shipments. */
import { localDateTimeOf } from '../dates';
import { RE_PERCENT, RE_PROMO, RE_SHIPMENT } from '../triage/signals';
import { brandInText, sentenceAround, type Ctx } from './common';
import type { ExtractedLifeEvent } from './types';

const CARRIERS: [RegExp, string][] = [
  [/(?<![\p{L}])yurt\s?içi(?:\s+kargo)?(?![\p{L}])/u, 'Yurtiçi Kargo'],
  [/(?<![\p{L}])aras(?:\s+kargo)?(?![\p{L}])/u, 'Aras Kargo'],
  [/(?<![\p{L}])mng(?:\s+kargo)?(?![\p{L}])/u, 'MNG Kargo'],
  [/(?<![\p{L}])sürat(?:\s+kargo)?(?![\p{L}])/u, 'Sürat Kargo'],
  [/(?<![\p{L}])ptt(?:\s+kargo)?(?![\p{L}])/u, 'PTT Kargo'],
  [/(?<![\p{L}])ups(?![\p{L}])/u, 'UPS'],
  [/(?<![\p{L}])dhl(?![\p{L}])/u, 'DHL'],
  [/(?<![\p{L}])fedex(?![\p{L}])/u, 'FedEx'],
  [/(?<![\p{L}])hepsijet(?![\p{L}])/u, 'Hepsijet'],
  [/(?<![\p{L}])trendyol express(?![\p{L}])/u, 'Trendyol Express'],
  [/(?<![\p{L}])kolay gelsin(?![\p{L}])/u, 'Kolay Gelsin'],
  [/(?<![\p{L}])sendeo(?![\p{L}])/u, 'Sendeo'],
  [/(?<![\p{L}])amazon lojistik(?![\p{L}])/u, 'Amazon Lojistik'],
  [/(?<![\p{L}])getir(?![\p{L}])/u, 'Getir'],
];
const MERCHANTS = [
  'Trendyol',
  'Hepsiburada',
  'Amazon',
  'n11',
  'Getir',
  'Çiçeksepeti',
  'LC Waikiki',
  'Boyner',
  'Zara',
  'Decathlon',
  'IKEA',
  'MediaMarkt',
  'Teknosa',
  'Vatan',
  'Migros',
  'CarrefourSA',
  'A101',
  'Koçtaş',
  'Defacto',
  'Mavi',
  'Beymen',
  'Morhipo',
  'Pazarama',
  'Temu',
  'AliExpress',
  'Shein',
  'eBay',
  'Apple',
];
const CARRIER_DOMAINS =
  /(?:yurticikargo|araskargo|mngkargo|suratkargo|ptt\.gov|gonderitakip|ups\.com|dhl\.|fedex\.|hepsijet|tex\.com|trendyol-express|kolaygelsin|sendeo)/iu;
const RE_STATUS =
  /(?<![\p{L}])(?:yola çıktı|kargoya verildi|kargoya teslim edildi|kargoya teslim|dağıtıma çıktı|dağıtımda|teslim edildi|teslim edilecek|teslim edilecektir|tahmini teslimat|teslimat tarihi|teslimat|kargoda|kargonuz|kargon|kuryemiz|kurye|şubeye|şubede|has shipped|shipped|out for delivery|on its way|delivered|dispatched|in transit|arriving|arrives|estimated delivery|delivery date)(?![\p{L}])/u;
const RE_DELIVERED =
  /(?<![\p{L}])(?:teslim edildi|teslim edilmiştir|delivered|has been delivered|was delivered)(?![\p{L}])/u;
const RE_TRACKING_LABEL =
  /(?<![\p{L}])(?:takip (?:no|numarası|numaranız|kodu|kodunuz)|kargo takip(?: no| numarası| kodu)?|gönderi (?:no|numarası|kodu|takip no)|tracking (?:number|no|id|code)|takip|tracking)\s*[:#.]?\s*(?<tn>[A-Z0-9]{8,30})(?![A-Z0-9])/iu;
const RE_ORDER_LABEL =
  /(?:sipariş (?:no|numarası|numaranız|kodu)|order (?:number|no|id)|order)\s*[:#.]?\s*$/iu;
const RE_DIGITS = /(?<![\d+])(?<tn>\d{10,20})(?!\d)/gu;
const RE_UPS = /(?<![A-Z0-9])(1Z[0-9A-Z]{16})(?![A-Z0-9])/u;
const RE_PTT = /(?<![A-Z0-9])([A-Z]{2}\d{9}TR)(?![A-Z0-9])/u;
const RE_DELIVERY_SENTENCE =
  /(?<![\p{L}])(?:teslim|teslimat|delivery|deliver|arriv|geliyor|gelecek|ulaşacak|ulaşır|bugün|yarın|today|tomorrow)(?![\p{L}])/u;

function findCarrier(ctx: Ctx): string | null {
  for (const [re, name] of CARRIERS) if (re.test(ctx.lower)) return name;
  if (ctx.senderOrg)
    for (const [re, name] of CARRIERS)
      if (re.test(ctx.senderOrg.toLocaleLowerCase('tr-TR'))) return name;
  return null;
}

function findMerchant(ctx: Ctx, carrier: string | null): string | null {
  const org = ctx.senderOrg;
  if (org) {
    const hit = brandInText(org.toLocaleLowerCase('tr-TR'), MERCHANTS);
    if (
      hit &&
      hit !== carrier &&
      !(hit === 'Trendyol' && carrier === 'Trendyol Express' && /express/iu.test(org))
    )
      return hit;
  }
  const inText = brandInText(ctx.lower.replace(/trendyol express/gu, ' '), MERCHANTS);
  if (inText && inText !== carrier) return inText;
  return null;
}

function findTracking(ctx: Ctx): { value: string; start: number; end: number } | null {
  const labelled = RE_TRACKING_LABEL.exec(ctx.text);
  if (labelled?.groups?.tn) {
    const start = labelled.index + labelled[0].length - labelled.groups.tn.length;
    return {
      value: labelled.groups.tn.toUpperCase(),
      start,
      end: start + labelled.groups.tn.length,
    };
  }
  const ups = RE_UPS.exec(ctx.text);
  if (ups?.[1]) return { value: ups[1], start: ups.index, end: ups.index + ups[1].length };
  const ptt = RE_PTT.exec(ctx.text);
  if (ptt?.[1]) return { value: ptt[1], start: ptt.index, end: ptt.index + ptt[1].length };
  RE_DIGITS.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_DIGITS.exec(ctx.text)) !== null) {
    const tn = m.groups?.tn ?? '';
    const before = ctx.lower.slice(Math.max(0, m.index - 30), m.index);
    if (RE_ORDER_LABEL.test(before)) continue;
    if (/^0|^90\d{10}$/.test(tn)) continue; // phone numbers
    if (ctx.dates.some((d) => m !== null && m.index < d.end && m.index + tn.length > d.start))
      continue;
    return { value: tn, start: m.index, end: m.index + tn.length };
  }
  const fromUrl = ctx.urls
    .map((u) =>
      /[?&](?:code|kod|takip|tracking|track|no|number|id)=([A-Za-z0-9]{8,30})/iu.exec(u.url),
    )
    .find((x) => x !== null);
  if (fromUrl?.[1]) return { value: fromUrl[1].toUpperCase(), start: -1, end: -1 };
  return null;
}

function findTrackingUrl(ctx: Ctx): string | null {
  const hit = ctx.urls.find(
    (u) =>
      CARRIER_DOMAINS.test(u.url) ||
      /(?:takip|track|tracking|gonderi-sorgula|shipment|kargotakip|siparis-takip)/iu.test(u.url),
  );
  return hit?.url ?? null;
}

function findWindow(
  ctx: Ctx,
): { start: string; end: string | null; from: number; to: number; hasTime: boolean } | null {
  for (const d of ctx.dates) {
    if (d.kind === 'time' && !d.hasTime) continue;
    const s = sentenceAround(ctx.lower, d.start);
    const sentence = ctx.lower.slice(s.start, s.end);
    if (!RE_DELIVERY_SENTENCE.test(sentence)) continue;
    if (d.kind === 'time') continue; // a bare clock needs a day
    // "bugün 14:00–18:00": the next clock-only span in the same sentence closes the window.
    const closing = ctx.dates.find(
      (x) => x.start > d.end && x.start < s.end && x.kind === 'time' && x.hasTime,
    );
    if (closing && d.hasTime) {
      const startLocal = localDateTimeOf(d.iso, ctx.timezone);
      const endLocal = localDateTimeOf(closing.iso, ctx.timezone);
      if (endLocal.hh * 60 + endLocal.mm > startLocal.hh * 60 + startLocal.mm) {
        const endIso = new Date(
          Date.parse(d.iso) +
            ((endLocal.hh - startLocal.hh) * 60 + (endLocal.mm - startLocal.mm)) * 60_000,
        ).toISOString();
        return { start: d.iso, end: endIso, from: d.start, to: closing.end, hasTime: true };
      }
    }
    return { start: d.iso, end: null, from: d.start, to: d.end, hasTime: d.hasTime };
  }
  return null;
}

export function detectShipment(ctx: Ctx): ExtractedLifeEvent | null {
  // On a reply the subject line quotes an earlier mail: only the body counts.
  const scope = ctx.isReply ? ctx.bodyLower : ctx.lower;
  const shipmentWords = RE_SHIPMENT.test(ctx.isReply ? ctx.bodyLower.slice(0, 400) : ctx.head);
  const carrier = findCarrier(ctx);
  const tracking = findTracking(ctx);
  const trackingUrl = findTrackingUrl(ctx);
  const status = RE_STATUS.test(scope);
  if (!shipmentWords && !carrier && !tracking) return null;
  const promo = RE_PROMO.test(ctx.head) || RE_PERCENT.test(ctx.subjectLower);
  if (!status && !tracking && !trackingUrl) return null;
  if (promo && !tracking && !trackingUrl) return null;

  const details: ExtractedLifeEvent['details'] = {};
  let confidence = 0.55;
  if (carrier) {
    details.carrier = carrier;
    confidence += 0.1;
  }
  const merchant = findMerchant(ctx, carrier);
  if (merchant) {
    details.merchant = merchant;
    confidence += 0.05;
  }
  if (tracking) {
    details.trackingNumber = tracking.value;
    if (tracking.start >= 0) ctx.evidence.add(tracking.start, tracking.end);
    else ctx.evidence.addText(tracking.value);
    confidence += 0.2;
  }
  if (trackingUrl) details.trackingUrl = trackingUrl;
  const window = findWindow(ctx);
  if (window) {
    details.deliveryWindow = { start: window.start, end: window.end };
    ctx.evidence.add(window.from, window.to);
    confidence += window.hasTime ? 0.1 : 0.05;
  }
  const statusMatch = RE_STATUS.exec(ctx.lower);
  if (statusMatch) ctx.evidence.add(statusMatch.index, statusMatch.index + statusMatch[0].length);
  const delivered = RE_DELIVERED.test(ctx.head);
  const out: ExtractedLifeEvent = {
    type: 'shipment',
    title: '',
    details,
    evidence: ctx.evidence.list(),
    confidence: Math.min(0.95, Math.round(confidence * 100) / 100),
    occurredAt: delivered ? ctx.now : null,
    provider: merchant ?? carrier ?? ctx.senderOrg,
  };
  if (delivered) out.delivered = true;
  return out;
}
