/**
 * Stage-1 (provider labels, sender shape, subject heuristics) + Stage-2 (rules, VIP, deterministic
 * content signals) classification into a TriageBucket. Security mail is never skipped.
 */
import type { EmailCategory, Importance, Locale } from '@da/domain';
import { deadlineFromText, formatDeadlinePhrase, hasDeadlineVocabulary } from '../dates';
import { stripQuotedHistory } from '../util';
import { isAutomatedSender, isBulkAddress, isNoReplyAddress, isSecuritySender } from './senders';
import {
  RE_AMOUNT,
  RE_ASKS_USER,
  RE_AUTO_REPLY_SUBJECT,
  RE_FINANCE,
  RE_MEETING,
  RE_OTP,
  RE_PERCENT,
  RE_PROMO,
  RE_SECURITY_EVENT_CRITICAL,
  RE_SECURITY_STRONG,
  RE_SECURITY_WEAK,
  RE_SHIPMENT,
  RE_SUBSCRIPTION,
  RE_TRAVEL,
  normalizeForSignals,
} from './signals';
import { matchRules, matchVip } from './rules';
import type { TriageContext, TriageEmailInput, TriageResult, TriageSignals } from './types';

const BODY_LIMIT = 4000;

type ReasonKey =
  | 'spam'
  | 'trash'
  | 'muted'
  | 'autoReply'
  | 'security'
  | 'securityCritical'
  | 'otp'
  | 'vip'
  | 'ruleImportant'
  | 'ruleLow'
  | 'fromUser'
  | 'fromUserAsks'
  | 'promotion'
  | 'newsletter'
  | 'social'
  | 'updates'
  | 'automated'
  | 'noReply'
  | 'deadline'
  | 'meeting'
  | 'shipment'
  | 'travel'
  | 'finance'
  | 'subscription'
  | 'human'
  | 'providerImportant';

const REASONS: Record<Locale, Record<ReasonKey, string>> = {
  tr: {
    spam: 'Sağlayıcı bunu spam olarak işaretlemiş',
    trash: 'Silinmiş / çöp kutusunda',
    muted: 'Kuralın: {label} sessize alınmış',
    autoReply: 'Otomatik yanıt (ofis dışı)',
    security: 'Güvenlik bildirimi',
    securityCritical: 'Güvenlik uyarısı: hesap etkinliği',
    otp: 'Doğrulama kodu — geçici içerik',
    vip: 'VIP: {name}',
    ruleImportant: 'Kuralın: {label}',
    ruleLow: 'Kuralın: {label} düşük öncelikli',
    fromUser: 'Senin gönderdiğin mail; takip için izleniyor',
    fromUserAsks: 'Senin gönderdiğin mail; karşı taraftan yanıt bekleniyor',
    promotion: 'Kampanya / reklam içeriği',
    newsletter: 'Bülten / toplu gönderim',
    social: 'Sosyal ağ bildirimi',
    updates: 'Otomatik güncelleme bildirimi',
    automated: 'Otomatik gönderici',
    noReply: 'Yanıtlanamayan adres',
    deadline: 'Son tarih var: {phrase}',
    meeting: 'Toplantı / davet ifadesi var',
    shipment: 'Kargo / sipariş bildirimi',
    travel: 'Seyahat / rezervasyon bildirimi',
    finance: 'Fatura / ödeme bildirimi',
    subscription: 'Abonelik bildirimi',
    human: 'Gerçek bir kişiden; AI analizi gerekiyor',
    providerImportant: 'Sağlayıcı önemli olarak işaretlemiş',
  },
  en: {
    spam: 'Marked as spam by the provider',
    trash: 'Deleted / in trash',
    muted: 'Your rule: {label} is muted',
    autoReply: 'Automatic reply (out of office)',
    security: 'Security notification',
    securityCritical: 'Security alert: account activity',
    otp: 'Verification code — transient content',
    vip: 'VIP: {name}',
    ruleImportant: 'Your rule: {label}',
    ruleLow: 'Your rule: {label} is low priority',
    fromUser: 'Sent by you; watched for follow-up',
    fromUserAsks: 'Sent by you; waiting for their reply',
    promotion: 'Promotional content',
    newsletter: 'Newsletter / bulk mail',
    social: 'Social network notification',
    updates: 'Automated update notification',
    automated: 'Automated sender',
    noReply: 'No-reply address',
    deadline: 'Deadline found: {phrase}',
    meeting: 'Mentions a meeting / invitation',
    shipment: 'Shipment / order notification',
    travel: 'Travel / reservation notification',
    finance: 'Invoice / payment notification',
    subscription: 'Subscription notification',
    human: 'From a real person; needs AI analysis',
    providerImportant: 'Marked important by the provider',
  },
};

function reason(locale: Locale, key: ReasonKey, params: Record<string, string> = {}): string {
  let s = REASONS[locale][key];
  for (const [k, v] of Object.entries(params)) s = s.replace(`{${k}}`, v);
  return s;
}

function labelSet(labels: string[]): Set<string> {
  return new Set(labels.map((l) => l.trim().toUpperCase()));
}

function hasLabel(set: Set<string>, ...names: string[]): boolean {
  return names.some((n) => set.has(n));
}

export function detectSignals(
  email: TriageEmailInput,
  ctx: TriageContext = {},
): { signals: TriageSignals; textLower: string; subjectLower: string } {
  const labels = labelSet(email.labels);
  const body = email.bodyText ? stripQuotedHistory(email.bodyText).slice(0, BODY_LIMIT) : '';
  const subjectLower = normalizeForSignals(email.subject);
  const textLower = normalizeForSignals(`${email.subject}\n${email.snippet}\n${body}`);
  const headLower = normalizeForSignals(`${email.subject}\n${email.snippet}`);
  const sender = email.from.email;
  const precedence = (email.precedence ?? '').toLowerCase();
  const autoSubmitted = (email.autoSubmitted ?? '').toLowerCase();

  const promotion = hasLabel(labels, 'CATEGORY_PROMOTIONS', 'PROMOTIONS');
  const promoSubject = RE_PROMO.test(subjectLower) || RE_PERCENT.test(subjectLower);
  const newsletter =
    Boolean(email.listUnsubscribe) ||
    precedence === 'bulk' ||
    precedence === 'list' ||
    precedence === 'junk' ||
    /(?<![\p{L}])(?:unsubscribe|abonelikten çık|listeden çık|newsletter|bülten)(?![\p{L}])/u.test(
      headLower,
    );
  const securityStrong =
    RE_SECURITY_STRONG.test(headLower) ||
    (isSecuritySender(sender) && RE_SECURITY_STRONG.test(textLower));
  const securityWeak = RE_SECURITY_WEAK.test(headLower);
  const otp = RE_OTP.test(headLower) && /(?<!\d)\d{4,8}(?!\d)/u.test(textLower);
  const ruleMatches = matchRules(ctx.rules, {
    senderEmail: sender,
    textLower: headLower,
    isPromotion: promotion || promoSubject,
  });
  const vip = matchVip(ctx.vips, sender, email.from.name);
  const deadline = hasDeadlineVocabulary(headLower) || hasDeadlineVocabulary(textLower);

  const signals: TriageSignals = {
    spam: hasLabel(labels, 'SPAM', 'JUNK', 'JUNKEMAIL', 'JUNK EMAIL'),
    trash: hasLabel(labels, 'TRASH', 'DELETED', 'DELETEDITEMS', 'DELETED ITEMS'),
    promotion,
    social: hasLabel(labels, 'CATEGORY_SOCIAL', 'SOCIAL'),
    updates: hasLabel(labels, 'CATEGORY_UPDATES', 'UPDATES'),
    forum: hasLabel(labels, 'CATEGORY_FORUMS', 'FORUMS'),
    otherInbox: hasLabel(labels, 'OTHER', 'CLUTTER'),
    providerImportant: hasLabel(labels, 'IMPORTANT', 'FOCUSED'),
    newsletter,
    noReply: isNoReplyAddress(sender),
    bulkSender: isBulkAddress(sender),
    automatedSender: isAutomatedSender(sender, ctx.automatedSenders ?? []),
    autoReply: autoSubmitted.startsWith('auto-replied') || RE_AUTO_REPLY_SUBJECT.test(subjectLower),
    promoSubject,
    vip: vip !== null,
    ruleImportant: ruleMatches.some((m) => m.effect === 'important'),
    ruleLow: ruleMatches.some((m) => m.effect === 'low'),
    ruleMuted: ruleMatches.some((m) => m.effect === 'mute'),
    deadline,
    meeting:
      RE_MEETING.test(headLower) ||
      /(?:zoom\.us|meet\.google\.com|teams\.microsoft\.com)/u.test(textLower),
    security: securityStrong || securityWeak,
    securityStrong,
    otp,
    finance:
      RE_FINANCE.test(headLower) &&
      (RE_AMOUNT.test(textLower) || RE_FINANCE.test(subjectLower) || deadline),
    travel: RE_TRAVEL.test(headLower),
    shipment: RE_SHIPMENT.test(headLower),
    subscription: RE_SUBSCRIPTION.test(headLower),
    asksUser: RE_ASKS_USER.test(headLower),
    fromUser: email.isFromUser,
    hasAttachments: email.hasAttachments,
  };
  return { signals, textLower, subjectLower };
}

export function triageEmail(email: TriageEmailInput, ctx: TriageContext = {}): TriageResult {
  const locale: Locale = ctx.locale ?? 'tr';
  const now = ctx.now ?? email.sentAt ?? new Date().toISOString();
  const timezone = ctx.timezone ?? 'Europe/Istanbul';
  const { signals } = detectSignals(email, ctx);
  const reasons: string[] = [];
  const sender = email.from.email;
  const ruleMatches = matchRules(ctx.rules, {
    senderEmail: sender,
    textLower: normalizeForSignals(`${email.subject}\n${email.snippet}`),
    isPromotion: signals.promotion || signals.promoSubject,
  });
  const vip = matchVip(ctx.vips, sender, email.from.name);
  const matchedRuleIds = ruleMatches.map((m) => m.rule.id);

  const base = (partial: Partial<TriageResult> & Pick<TriageResult, 'bucket'>): TriageResult => ({
    signals,
    needsAi: partial.bucket === 'ai',
    reasons,
    deadline: null,
    matchedRuleIds,
    vipName: vip?.displayName ?? null,
    fastPath: null,
    ...partial,
  });

  // Evidence-backed deadline (used by several branches below).
  const deadlineSource = `${email.subject}\n${email.snippet}\n${email.bodyText ? stripQuotedHistory(email.bodyText).slice(0, BODY_LIMIT) : ''}`;
  const deadlineHit = signals.deadline
    ? deadlineFromText({ text: deadlineSource, now: email.sentAt ?? now, timezone, locale })
    : null;
  const deadline = deadlineHit
    ? { iso: deadlineHit.iso, text: deadlineHit.text, evidence: deadlineHit.evidence }
    : null;
  const deadlineReason = deadline
    ? reason(locale, 'deadline', {
        phrase: formatDeadlinePhrase(deadline.iso, {
          now,
          timezone,
          locale,
          hasTime: deadlineHit?.hasTime ?? false,
        }),
      })
    : null;

  // --- Stage 1: hard skips ---------------------------------------------------------------
  if (signals.spam) {
    reasons.push(reason(locale, 'spam'));
    return base({ bucket: 'skip', preImportance: 'low' });
  }
  if (signals.trash) {
    reasons.push(reason(locale, 'trash'));
    return base({ bucket: 'skip', preImportance: 'low' });
  }
  const muteRule = ruleMatches.find((m) => m.effect === 'mute');
  if (muteRule && !signals.securityStrong) {
    reasons.push(reason(locale, 'muted', { label: muteRule.rule.label }));
    return base({ bucket: 'skip', preImportance: 'low' });
  }

  // --- Security fast path (never skipped, no AI needed) ------------------------------------
  if (signals.securityStrong) {
    const head = normalizeForSignals(`${email.subject}\n${email.snippet}`);
    const critical = RE_SECURITY_EVENT_CRITICAL.test(head);
    if (signals.otp && !critical) {
      reasons.push(reason(locale, 'otp'));
      return base({
        bucket: 'rules',
        preCategory: 'security',
        preImportance: 'low',
        fastPath: 'security',
      });
    }
    reasons.push(reason(locale, critical ? 'securityCritical' : 'security'));
    return base({
      bucket: 'rules',
      preCategory: 'security',
      preImportance: critical ? 'critical' : 'high',
      fastPath: 'security',
    });
  }

  if (signals.autoReply) {
    reasons.push(reason(locale, 'autoReply'));
    return base({ bucket: 'skip', preCategory: 'information', preImportance: 'low' });
  }

  // --- Sent by the user: deterministic follow-up / commitment handling ----------------------
  if (email.isFromUser) {
    reasons.push(reason(locale, signals.asksUser ? 'fromUserAsks' : 'fromUser'));
    if (deadlineReason) reasons.push(deadlineReason);
    return base({
      bucket: 'rules',
      preCategory: signals.asksUser ? 'waiting_for_other' : 'information',
      deadline,
    });
  }

  // --- Stage 2: explicit rules and VIP beat every heuristic ------------------------------
  const importantRule = ruleMatches.find((m) => m.effect === 'important');
  if (importantRule) {
    reasons.push(reason(locale, 'ruleImportant', { label: importantRule.rule.label }));
    if (deadlineReason) reasons.push(deadlineReason);
    return base({
      bucket: 'ai',
      preImportance: 'high',
      preCategory: deadline ? 'deadline' : undefined,
      deadline,
    });
  }
  if (vip) {
    reasons.push(reason(locale, 'vip', { name: vip.displayName }));
    if (deadlineReason) reasons.push(deadlineReason);
    return base({
      bucket: 'ai',
      preImportance: 'high',
      preCategory: deadline ? 'deadline' : undefined,
      deadline,
    });
  }
  const lowRule = ruleMatches.find((m) => m.effect === 'low');
  if (lowRule) {
    reasons.push(reason(locale, 'ruleLow', { label: lowRule.rule.label }));
    return base({
      bucket: 'low',
      preCategory: signals.promotion || signals.promoSubject ? 'promotion' : 'information',
      preImportance: 'low',
    });
  }

  // --- Automated / bulk context -----------------------------------------------------------
  const lowContext =
    signals.promotion ||
    signals.social ||
    signals.updates ||
    signals.forum ||
    signals.otherInbox ||
    signals.newsletter ||
    signals.noReply ||
    signals.bulkSender ||
    signals.automatedSender ||
    signals.promoSubject;
  const marketing =
    signals.promotion || signals.promoSubject || (signals.newsletter && !signals.noReply);

  if (lowContext) {
    const transactional = pickTransactional(signals);
    if (transactional && !(marketing && !signals.noReply && !signals.automatedSender)) {
      reasons.push(reason(locale, transactional.key));
      if (deadlineReason) reasons.push(deadlineReason);
      return base({
        bucket: 'rules',
        preCategory: transactional.category,
        preImportance: 'normal',
        deadline,
      });
    }
    if (signals.meeting && !marketing) {
      reasons.push(reason(locale, 'meeting'));
      return base({ bucket: 'rules', preCategory: 'meeting', preImportance: 'normal', deadline });
    }
    if (deadline && !marketing) {
      reasons.push(deadlineReason ?? reason(locale, 'deadline', { phrase: deadline.text }));
      return base({ bucket: 'ai', preCategory: 'deadline', preImportance: 'high', deadline });
    }
    if (signals.providerImportant && !signals.promotion && !signals.newsletter) {
      reasons.push(reason(locale, 'providerImportant'));
      return base({ bucket: 'ai', deadline });
    }
    const key =
      signals.promotion || signals.promoSubject
        ? 'promotion'
        : signals.newsletter
          ? 'newsletter'
          : signals.social
            ? 'social'
            : signals.updates
              ? 'updates'
              : signals.noReply
                ? 'noReply'
                : 'automated';
    reasons.push(reason(locale, key));
    return base({
      bucket: 'low',
      preCategory:
        signals.promotion || signals.promoSubject || signals.newsletter
          ? 'promotion'
          : 'information',
      preImportance: 'low',
    });
  }

  // --- Human sender: AI decides; hints from deterministic signals --------------------------
  let preCategory: EmailCategory | undefined;
  let preImportance: Importance | undefined;
  if (deadline) {
    preCategory = 'deadline';
    preImportance = 'high';
    reasons.push(deadlineReason ?? reason(locale, 'deadline', { phrase: deadline.text }));
  } else if (signals.meeting) {
    preCategory = 'meeting';
    reasons.push(reason(locale, 'meeting'));
  } else {
    const transactional = pickTransactional(signals);
    if (transactional) {
      preCategory = transactional.category;
      reasons.push(reason(locale, transactional.key));
    }
  }
  if (signals.providerImportant) reasons.push(reason(locale, 'providerImportant'));
  if (reasons.length === 0) reasons.push(reason(locale, 'human'));
  return base({ bucket: 'ai', preCategory, preImportance, deadline });
}

function pickTransactional(
  signals: TriageSignals,
): { key: ReasonKey; category: EmailCategory } | null {
  if (signals.shipment && !signals.travel) return { key: 'shipment', category: 'shipment' };
  if (signals.travel) return { key: 'travel', category: 'travel' };
  if (signals.subscription) return { key: 'subscription', category: 'subscription' };
  if (signals.finance) return { key: 'finance', category: 'payment' };
  if (signals.shipment) return { key: 'shipment', category: 'shipment' };
  return null;
}

/** Content fingerprints already analyzed never hit the model twice. */
export function shouldSendToAi(
  triage: Pick<TriageResult, 'needsAi' | 'bucket'>,
  alreadyAnalyzedFingerprint: boolean,
): boolean {
  return triage.needsAi && triage.bucket === 'ai' && !alreadyAnalyzedFingerprint;
}
