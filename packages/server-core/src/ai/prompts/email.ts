/** Email prompts: deep analysis and batch classification (reply drafts and commitments live in reply.ts / commitment.ts). */
import type { Locale } from '@da/domain';
import {
  emailAnalysisAiSchema,
  emailBatchClassificationSchema,
  type EmailAnalysisAi,
  type EmailBatchClassification,
} from '@da/validation';
import { AppError } from '../../errors';
import { PROMPT_CHAR_LIMITS, redactForPrompt } from '../redact';
import type { PromptSpec } from '../types';
import {
  DEFAULT_PROMPT_TIMEZONE,
  bullets,
  capList,
  clipInline,
  composeSystem,
  formatPromptDateTime,
  joinLines,
  labelled,
  personLabel,
  temporalContext,
  type PromptBase,
  type PromptParticipant,
} from './shared';

export interface PromptEmailMessage {
  id: string;
  subject: string;
  from: PromptParticipant;
  to?: PromptParticipant[];
  cc?: PromptParticipant[];
  sentAt: string;
  body: string;
  attachments?: { filename: string; mimeType?: string | null }[];
  isFromUser?: boolean;
}

export interface UserSignals {
  userName: string;
  /** The user's own addresses so "sent by me" is unambiguous. */
  userEmails?: string[];
  vipEmails?: string[];
  interests?: string[];
  /** Explicit user rules (highest authority): "Muhasebe maillerini her zaman önemli say". */
  userRules?: string[];
}

function userSignalLines(signals: UserSignals, locale: Locale): string[] {
  const en = locale === 'en';
  const lines: string[] = [];
  if (signals.userEmails?.length)
    lines.push(
      `${en ? 'User addresses' : 'Kullanıcının adresleri'}: ${signals.userEmails.join(', ')}`,
    );
  if (signals.vipEmails?.length)
    lines.push(`${en ? 'VIP senders' : 'VIP göndericiler'}: ${signals.vipEmails.join(', ')}`);
  if (signals.interests?.length)
    lines.push(`${en ? 'Interests' : 'İlgi alanları'}: ${signals.interests.join(', ')}`);
  if (signals.userRules?.length) {
    lines.push(
      `${en ? 'Explicit user rules (override everything else)' : 'Kullanıcının açık kuralları (her şeyin üstünde)'}:\n${bullets(signals.userRules.slice(0, 12))}`,
    );
  }
  return lines;
}

function messageHeader(m: PromptEmailMessage, tz: string, locale: Locale): string {
  const en = locale === 'en';
  return joinLines([
    `id: ${m.id}`,
    labelled(en ? 'From' : 'Kimden', personLabel(m.from)),
    labelled(en ? 'To' : 'Kime', m.to?.map(personLabel).join(', ')),
    labelled(en ? 'Cc' : 'Cc', m.cc?.map(personLabel).join(', ')),
    labelled(en ? 'Date' : 'Tarih', formatPromptDateTime(m.sentAt, tz, locale)),
    labelled(en ? 'Subject' : 'Konu', clipInline(m.subject, 200)),
    m.attachments?.length
      ? `${en ? 'Attachments' : 'Ekler'}: ${m.attachments.map((a) => clipInline(a.filename, 80)).join(', ')}`
      : null,
    m.isFromUser ? (en ? 'Sent by the user.' : 'Bu iletiyi kullanıcı göndermiş.') : null,
  ]);
}

// ---------------------------------------------------------------------------
// emailDeepAnalysis
// ---------------------------------------------------------------------------

export interface EmailDeepAnalysisInput extends PromptBase, UserSignals {
  message: PromptEmailMessage;
  /** Earlier messages of the thread (newest first), used only for context. */
  previousMessages?: { from: PromptParticipant; sentAt: string; excerpt: string }[];
}

export function emailDeepAnalysis(input: EmailDeepAnalysisInput): PromptSpec<EmailAnalysisAi> {
  const locale = input.locale ?? 'tr';
  const tz = input.timezone ?? DEFAULT_PROMPT_TIMEZONE;
  const en = locale === 'en';
  const system = composeSystem({
    locale,
    role: en
      ? `You are the email analysis engine of Dijital Asistan, a personal assistant for ${input.userName}. Read one email from the user's point of view and produce a structured analysis.`
      : `Sen Dijital Asistan'ın e-posta analiz motorusun; ${input.userName} adlı kullanıcı için çalışıyorsun. Tek bir e-postayı kullanıcının gözünden oku ve yapılandırılmış bir analiz üret.`,
    rules: en
      ? [
          'importance: critical = needs the user today (money, security, flights, a boss/VIP asking); high = needs an action or reply this week; normal = worth knowing; low = promotions, newsletters, automated noise.',
          'category: pick the single best fit from the schema enum. Use "promotion" for marketing, "information" when nothing is asked of the user.',
          'requiresUserAction is true only when the sender clearly expects something from the user.',
          'deadline: only when a date is explicitly written; put the verbatim phrase in evidence. Resolve relative phrases from the email date.',
          'commitments: user_owes when the user promised something, other_owes when the sender promised something. quote must be verbatim.',
          'followUp.expected is true when the user is waiting for the other side to answer.',
          'suggestedActions: at most 4, short natural labels ("Yanıtla", "Takvime ekle").',
          'lifeEvent only for shipments, flights, reservations, payments, subscriptions and security alerts, with evidence.',
          'Explicit user rules beat everything else, including learned preferences.',
          'summary is 1-2 calm sentences; keyPoints are short fragments, no markdown.',
        ]
      : [
          'importance: critical = bugün kullanıcının müdahalesi gerekir (para, güvenlik, uçuş, yönetici/VIP isteği); high = bu hafta bir aksiyon ya da yanıt gerekir; normal = bilmesi iyi olur; low = promosyon, bülten, otomatik gürültü.',
          'category: şemadaki seçeneklerden tek ve en uygun olanı seç. Pazarlama için "promotion", kullanıcıdan bir şey istenmiyorsa "information".',
          'requiresUserAction yalnızca gönderen kullanıcıdan açıkça bir şey bekliyorsa true.',
          'deadline: yalnızca tarih açıkça yazılmışsa; kaynaktaki ifadeyi evidence alanına birebir koy. Göreli ifadeleri e-posta tarihinden hesapla.',
          'commitments: kullanıcı söz verdiyse user_owes, gönderen söz verdiyse other_owes. quote birebir alıntı olmalı.',
          'followUp.expected, kullanıcı karşı taraftan yanıt bekliyorsa true.',
          'suggestedActions: en fazla 4, kısa ve doğal etiketler ("Yanıtla", "Takvime ekle").',
          'lifeEvent yalnızca kargo, uçuş, rezervasyon, ödeme, abonelik ve güvenlik uyarıları için; kanıtla birlikte.',
          'Kullanıcının açık kuralları her şeyin üstündedir; öğrenilmiş tercihlerden de önce gelir.',
          'summary 1-2 sakin cümle; keyPoints kısa parçalar, markdown yok.',
        ],
    sections: [
      {
        title: en ? 'Context' : 'Bağlam',
        body: joinLines([
          temporalContext({ now: input.now, locale, timezone: tz }),
          ...userSignalLines(input, locale),
        ]),
      },
    ],
  });
  const previous = capList(input.previousMessages ?? [], 3, locale);
  const previousBlock = previous.items.length
    ? joinLines([
        en ? 'Earlier in this thread:' : 'Bu yazışmada daha önce:',
        ...previous.items.map(
          (p) =>
            `- ${personLabel(p.from)} · ${formatPromptDateTime(p.sentAt, tz, locale)}: ${redactForPrompt(p.excerpt, { maxChars: 500, locale })}`,
        ),
        previous.note,
      ])
    : null;
  const context = joinLines([
    messageHeader(input.message, tz, locale),
    '',
    redactForPrompt(input.message.body, { purpose: 'email_deep_analysis', locale }),
    previousBlock ? `\n${previousBlock}` : null,
  ]);
  return {
    purpose: 'email_deep_analysis',
    tier: 'large',
    locale,
    system,
    user: en
      ? 'Analyse the email below and return the structured result.'
      : 'Aşağıdaki e-postayı analiz et ve yapılandırılmış sonucu döndür.',
    context,
    schema: emailAnalysisAiSchema,
    maxOutputTokens: 1500,
    temperature: 0.2,
  };
}

// ---------------------------------------------------------------------------
// emailBatchClassify
// ---------------------------------------------------------------------------

export const EMAIL_BATCH_MAX = 30;

export interface EmailBatchClassifyInput extends PromptBase, UserSignals {
  emails: {
    id: string;
    from: PromptParticipant;
    subject: string;
    snippet: string;
    sentAt: string;
    hasAttachments?: boolean;
    isFromUser?: boolean;
  }[];
}

export function emailBatchClassify(
  input: EmailBatchClassifyInput,
): PromptSpec<EmailBatchClassification> {
  const locale = input.locale ?? 'tr';
  const tz = input.timezone ?? DEFAULT_PROMPT_TIMEZONE;
  const en = locale === 'en';
  if (input.emails.length === 0 || input.emails.length > EMAIL_BATCH_MAX) {
    throw new AppError(
      'validation',
      en
        ? `Batch must contain 1-${EMAIL_BATCH_MAX} emails.`
        : `Toplu sınıflandırma 1-${EMAIL_BATCH_MAX} e-posta almalı.`,
      {
        details: { count: input.emails.length, max: EMAIL_BATCH_MAX },
      },
    );
  }
  const system = composeSystem({
    locale,
    role: en
      ? `You are the fast email triage engine of Dijital Asistan for ${input.userName}. Classify each email from a compact one-line summary.`
      : `Sen Dijital Asistan'ın hızlı e-posta eleme motorusun; ${input.userName} için çalışıyorsun. Her e-postayı tek satırlık özetinden sınıflandır.`,
    rules: en
      ? [
          'Return exactly one result per input id, in the same order, with the id copied verbatim.',
          'importance and category follow the same definitions as the deep analysis: critical / high / normal / low.',
          'needsDeepAnalysis is true when the email likely contains a deadline, commitment, meeting, payment, travel or a personal request that deserves a full read.',
          'oneLine is a calm one-sentence gist, max 160 characters, no markdown.',
          'Explicit user rules and VIP senders beat your own judgement.',
        ]
      : [
          'Her giriş id için tam olarak bir sonuç döndür; aynı sırada ve id birebir aynı olsun.',
          'importance ve category, derin analizdeki tanımlarla aynı: critical / high / normal / low.',
          'needsDeepAnalysis: e-postada son tarih, taahhüt, toplantı, ödeme, seyahat ya da kişisel bir istek olma ihtimali varsa true.',
          'oneLine: sakin, tek cümlelik öz; en fazla 160 karakter, markdown yok.',
          'Kullanıcının açık kuralları ve VIP göndericiler kendi yargından önce gelir.',
        ],
    sections: [
      {
        title: en ? 'Context' : 'Bağlam',
        body: joinLines([
          temporalContext({ now: input.now, locale, timezone: tz }),
          ...userSignalLines(input, locale),
        ]),
      },
    ],
  });
  const perItem = PROMPT_CHAR_LIMITS.email_batch_classify;
  const lines = input.emails.map((e) =>
    [
      `[${e.id}]`,
      `${en ? 'from' : 'kimden'}=${personLabel(e.from)}`,
      `${en ? 'date' : 'tarih'}=${formatPromptDateTime(e.sentAt, tz, locale)}`,
      `${en ? 'subject' : 'konu'}=${clipInline(e.subject, 120)}`,
      `${en ? 'snippet' : 'özet'}=${clipInline(redactForPrompt(e.snippet, { maxChars: perItem, locale, keepSignature: true }), perItem)}`,
      e.hasAttachments ? (en ? 'attachments=yes' : 'ek=var') : null,
      e.isFromUser ? (en ? 'sentByUser=yes' : 'gönderen=kullanıcı') : null,
    ]
      .filter(Boolean)
      .join(' | '),
  );
  return {
    purpose: 'email_batch_classify',
    tier: 'small',
    locale,
    system,
    user: en
      ? `Classify the ${input.emails.length} emails below.`
      : `Aşağıdaki ${input.emails.length} e-postayı sınıflandır.`,
    context: lines.join('\n'),
    schema: emailBatchClassificationSchema,
    maxOutputTokens: Math.min(4000, 120 * input.emails.length + 200),
    temperature: 0.1,
  };
}
