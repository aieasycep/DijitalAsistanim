/** Bills & payments: explicit amount, deadline cue, payee (sender org or labelled), payment link labelled öde/pay. Never a receipt, never a promotion. */
import { deadlineFromText } from '../dates';
import { RE_FINANCE, RE_PERCENT, RE_PROMO } from '../triage/signals';
import { findAmounts, labelledValue, pickAmount, type Ctx } from './common';
import type { BillKind, ExtractedLifeEvent } from './types';

const RE_STRONG_FINANCE =
  /(?<![\p{L}])(?:fatura|faturanız|faturası|e-fatura|e-arşiv|invoice|son ödeme|vade|ödeme tarihi|payment due|amount due|ekstre|borcunuz|borç|ödenmemiş|ödeme bekleyen|ödemeniz gereken|hesap özeti|statement|aidat|kira|taksit|tahakkuk)(?![\p{L}])/u;
const RE_RECEIPT =
  /(?<![\p{L}])(?:ödeme(?:niz)? alındı|ödemeniz alınmıştır|ödeme başarılı|ödendi|ödenmiştir|başarıyla ödendi|tahsil edildi|payment (?:received|successful|confirmed|complete|completed)|thank you for your payment|receipt|makbuz|dekont|paid in full|has been paid|was paid)(?![\p{L}])/u;
const RE_AMOUNT_LABEL =
  /(?:toplam|tutar|ödenecek|borç|borcunuz|amount|total|due|fatura tutarı|ödeme tutarı|bedel|ücret|ekstre borcu|dönem borcu|asgari)/u;
const RE_PAY_LINK =
  /(?:öde|ödeme|pay|fatura(?:yı|nızı|mı)? (?:görüntüle|öde|gör)|view (?:bill|invoice)|hemen öde)/iu;
const RE_PAY_PATH = /(?:\/pay|odeme|\/ode\b|fatura|invoice|bill|checkout)/iu;
const BILL_KINDS: [RegExp, BillKind][] = [
  [/(?<![\p{L}])elektrik(?![\p{L}])/u, 'electricity'],
  [
    /(?<![\p{L}])(?:su faturası|su faturanız|su tüketim|su bedeli|iski|aski|izsu)(?![\p{L}])/u,
    'water',
  ],
  [/(?<![\p{L}])(?:doğal ?gaz|doğalgaz|gaz faturası|igdaş|başkentgaz|izgaz)(?![\p{L}])/u, 'gas'],
  [/(?<![\p{L}])(?:internet|fiber|adsl)(?![\p{L}])/u, 'internet'],
  [/(?<![\p{L}])(?:telefon|mobil|gsm|hat faturası|cep)(?![\p{L}])/u, 'phone'],
  [/(?<![\p{L}])(?:kredi kartı|ekstre|credit card|statement)(?![\p{L}])/u, 'credit_card'],
  [/(?<![\p{L}])aidat(?![\p{L}])/u, 'dues'],
  [/(?<![\p{L}])kira(?:sı|nız)?(?![\p{L}])/u, 'rent'],
  [/(?<![\p{L}])(?:sigorta|poliçe|kasko|insurance)(?![\p{L}])/u, 'insurance'],
  [/(?<![\p{L}])(?:vergi|mtv|tax)(?![\p{L}])/u, 'tax'],
  [/(?<![\p{L}])(?:okul|eğitim ücreti|tuition|kurs ücreti)(?![\p{L}])/u, 'school'],
];

function billKindOf(ctx: Ctx): BillKind | null {
  for (const [re, kind] of BILL_KINDS) if (re.test(ctx.head)) return kind;
  for (const [re, kind] of BILL_KINDS) if (re.test(ctx.lower)) return kind;
  return null;
}

function findPaymentUrl(ctx: Ctx): string | null {
  for (const u of ctx.urls) {
    const before = ctx.lower.slice(Math.max(0, u.start - 48), u.start);
    if (RE_PAY_LINK.test(before) || RE_PAY_PATH.test(u.url)) return u.url;
  }
  return null;
}

export function detectPayment(ctx: Ctx): ExtractedLifeEvent | null {
  if (!RE_FINANCE.test(ctx.lower)) return null;
  const amounts = findAmounts(ctx.lower);
  const due = deadlineFromText({ text: ctx.text, now: ctx.now, timezone: ctx.timezone });
  const strong = RE_STRONG_FINANCE.test(ctx.lower);
  const promo = RE_PROMO.test(ctx.head) || RE_PERCENT.test(ctx.head);
  if (amounts.length === 0 && !due) return null;
  if (!strong) return null;
  if (promo && !due && !/(?<![\p{L}])(?:fatura|invoice)(?![\p{L}])/u.test(ctx.subjectLower))
    return null;
  if (RE_RECEIPT.test(ctx.head) && !due) return null;

  const details: ExtractedLifeEvent['details'] = {};
  let confidence = 0.55;
  const amount = pickAmount(ctx.lower, amounts, RE_AMOUNT_LABEL);
  if (amount) {
    details.amount = amount.amount;
    details.currency = amount.currency;
    ctx.evidence.add(amount.start, amount.end);
    confidence += RE_AMOUNT_LABEL.test(
      ctx.lower.slice(Math.max(0, amount.start - 48), amount.start),
    )
      ? 0.15
      : 0.1;
  }
  if (due) {
    details.dueAt = due.iso;
    ctx.evidence.add(due.start, due.end);
    confidence += 0.15;
  }
  const payeeLabel = labelledValue(ctx.text, /alıcı|payee|kurum|firma|biller|hesap sahibi/);
  const payee = payeeLabel?.value ?? ctx.senderOrg;
  if (payee) {
    details.payee = payee.slice(0, 120);
    if (payeeLabel) ctx.evidence.add(payeeLabel.start, payeeLabel.end);
    confidence += 0.05;
  }
  const paymentUrl = findPaymentUrl(ctx);
  if (paymentUrl) details.paymentUrl = paymentUrl;
  if (details.amount === undefined && details.dueAt === undefined) return null;
  return {
    type: 'payment',
    title: '',
    details,
    evidence: ctx.evidence.list(),
    confidence: Math.min(0.95, Math.round(confidence * 100) / 100),
    occurredAt: null,
    provider: ctx.senderOrg,
    billKind: billKindOf(ctx),
  };
}
