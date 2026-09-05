/** Subscriptions: service name from the sender (or a known service in the text), renewal date with evidence, amount when present. */
import { deadlineFromText } from '../dates';
import { RE_SUBSCRIPTION } from '../triage/signals';
import { brandInText, dateNear, findAmounts, pickAmount, type Ctx } from './common';
import type { ExtractedLifeEvent } from './types';

const SERVICES = [
  'Netflix', 'Spotify', 'YouTube Premium', 'YouTube Music', 'Apple Music', 'Apple TV+', 'iCloud', 'Apple One', 'Google One', 'Amazon Prime', 'Prime Video', 'Disney+',
  'Exxen', 'BluTV', 'Gain', 'TOD', 'beIN Connect', 'S Sport Plus', 'Adobe', 'Creative Cloud', 'Microsoft 365', 'Office 365', 'Dropbox', 'Canva', 'ChatGPT', 'ChatGPT Plus',
  'Notion', 'Zoom', 'LinkedIn Premium', 'Duolingo', 'Tinder', 'Strava', 'Fizy', 'Storytel', 'Audible', 'Kindle Unlimited', 'PlayStation Plus', 'Xbox Game Pass',
  'Nintendo Switch Online', 'Digiturk', 'D-Smart', 'Tivibu', 'TV+', 'Amazon Music', 'Deezer', 'Tidal', 'Figma', 'Slack', 'GitHub', 'Vercel', 'Heroku', 'AWS', 'Google Workspace',
  'Evernote', 'Todoist', 'Headspace', 'Calm', 'Nike Training', 'Peloton', 'Hepsiburada Premium', 'Trendyol Premium', 'Getir Plus', 'Yemeksepeti Plus', 'Superonline',
  'Turkcell TV+', 'Türk Telekom', 'Vodafone', 'Turkcell',
];
const RE_RENEWAL = /(?<![\p{L}])(?:yenilenecek(?:tir)?|yenileniyor|yenilenir|yenileme|otomatik olarak yenilen\p{L}*|otomatik yenileme|renews?|renewal|will renew|auto-?renews?|auto-?renewal|will be charged|charged|faturalandırılacak|ücretlendirilecek|tahsil edilecek|deneme süre\p{L}*|trial (?:ends|period|expires)|aboneliğiniz|üyeliğiniz|subscription|membership)(?![\p{L}])/u;
const RE_RENEW_DATE = /(?<![\p{L}])(?:yenilen|yenileme|renew|charged|faturalandır|ücretlendir|tahsil|deneme|trial|sona er|expires|bitiyor|biter)/u;
const RE_AMOUNT_LABEL = /(?:ücret|tutar|fiyat|price|amount|charged|cost|bedel|aylık|yıllık|monthly|yearly|annual|plan)/u;

function findService(ctx: Ctx): string | null {
  const inSender = ctx.senderOrg ? brandInText(ctx.senderOrg.toLocaleLowerCase('tr-TR'), SERVICES) : null;
  if (inSender) return inSender;
  const inSubject = brandInText(ctx.subjectLower, SERVICES);
  if (inSubject) return inSubject;
  const inText = brandInText(ctx.lower, SERVICES);
  if (inText) return inText;
  return ctx.senderOrg;
}

export function hasRenewalCue(ctx: Ctx): boolean {
  return RE_SUBSCRIPTION.test(ctx.head) || RE_RENEWAL.test(ctx.head);
}

export function detectSubscription(ctx: Ctx): ExtractedLifeEvent | null {
  if (!hasRenewalCue(ctx) && !RE_RENEWAL.test(ctx.lower)) return null;
  const service = findService(ctx);
  if (!service) return null;
  const renews = dateNear(ctx, RE_RENEW_DATE, (d) => d.kind !== 'time') ?? deadlineFromText({ text: ctx.text, now: ctx.now, timezone: ctx.timezone }) ?? ctx.dates.find((d) => d.kind !== 'time') ?? null;
  const amounts = findAmounts(ctx.lower);
  const amount = pickAmount(ctx.lower, amounts, RE_AMOUNT_LABEL);
  if (!renews && !amount) return null;

  const details: ExtractedLifeEvent['details'] = { serviceName: service.slice(0, 80) };
  let confidence = 0.6;
  if (renews) {
    details.renewsAt = renews.iso;
    ctx.evidence.add(renews.start, renews.end);
    confidence += 0.2;
  }
  if (amount) {
    details.amount = amount.amount;
    details.currency = amount.currency;
    ctx.evidence.add(amount.start, amount.end);
    confidence += 0.1;
  }
  const cue = RE_RENEWAL.exec(ctx.lower);
  if (cue) ctx.evidence.add(cue.index, cue.index + cue[0].length);
  return {
    type: 'subscription',
    title: '',
    details,
    evidence: ctx.evidence.list(),
    confidence: Math.min(0.92, Math.round(confidence * 100) / 100),
    occurredAt: null,
    provider: service,
  };
}
