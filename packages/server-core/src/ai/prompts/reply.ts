/**
 * Reply drafts: tone-controlled, Turkish by default, signed with the user's first name, grounded in
 * the thread messages and the stored analysis. The draft is only ever shown for approval.
 */
import type { Locale, ReplyTone } from '@da/domain';
import { replyDraftAiSchema, type ReplyDraftAi } from '@da/validation';
import { redactForPrompt } from '../redact';
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

/** Thread messages sent to the model (the newest ones win when the thread is longer). */
export const REPLY_THREAD_MESSAGE_MAX = 6;

export interface ReplyThreadMessage {
  id: string;
  from: PromptParticipant;
  sentAt: string;
  body: string;
  isFromUser: boolean;
}

/** The stored analysis of the thread (facts the draft may rely on; never a substitute for the messages). */
export interface ReplyThreadAnalysis {
  summary?: string | null;
  keyPoints?: string[];
  requiresUserAction?: boolean;
  deadlineText?: string | null;
  /** Open commitments in this thread ("teklifi cuma göndereceğim"). */
  commitments?: { text: string; direction: 'user_owes' | 'other_owes'; dueText?: string | null }[];
}

export interface ReplyDraftInput extends PromptBase {
  tone: ReplyTone;
  userFirstName: string;
  userEmails?: string[];
  thread: {
    subject: string;
    /** Oldest first; the last message is the one being answered. */
    messages: ReplyThreadMessage[];
  };
  analysis?: ReplyThreadAnalysis | null;
  /** Extra instruction from the user ("kibarca reddet", "cuma öner"). */
  instructions?: string | null;
  recipient?: PromptParticipant | null;
}

export const TONE_RULES: Record<ReplyTone, { tr: string; en: string }> = {
  short: { tr: 'Ton: kısa. 1-3 cümle, doğrudan konuya gir.', en: 'Tone: short. 1-3 sentences, straight to the point.' },
  professional: { tr: 'Ton: profesyonel. Nazik ve net; resmi ama soğuk değil.', en: 'Tone: professional. Polite and clear; formal but not cold.' },
  friendly: { tr: 'Ton: samimi. Sıcak, günlük dil; abartısız.', en: 'Tone: friendly. Warm, everyday language; not over the top.' },
  detailed: {
    tr: 'Ton: detaylı. Kaynaktaki her noktayı sırayla ele al; yine de gereksiz uzatma.',
    en: 'Tone: detailed. Address every point in the source in order; still no padding.',
  },
};

function analysisBlock(analysis: ReplyThreadAnalysis | null | undefined, locale: Locale): string | null {
  if (!analysis) return null;
  const en = locale === 'en';
  const commitments = (analysis.commitments ?? []).slice(0, 5);
  const lines = joinLines([
    labelled(en ? 'Summary' : 'Özet', analysis.summary ? clipInline(analysis.summary, 320) : null),
    analysis.keyPoints?.length ? `${en ? 'Key points' : 'Önemli noktalar'}:\n${bullets(analysis.keyPoints.slice(0, 5).map((p) => clipInline(p, 120)))}` : null,
    analysis.requiresUserAction === undefined
      ? null
      : `${en ? 'Sender expects an action from the user' : 'Gönderen kullanıcıdan bir aksiyon bekliyor'}: ${analysis.requiresUserAction ? (en ? 'yes' : 'evet') : (en ? 'no' : 'hayır')}`,
    labelled(en ? 'Deadline mentioned in the thread' : 'Yazışmada geçen son tarih', analysis.deadlineText ? clipInline(analysis.deadlineText, 120) : null),
    commitments.length
      ? `${en ? 'Open commitments' : 'Açık taahhütler'}:\n${bullets(commitments.map((c) => `${c.direction} · ${clipInline(c.text, 160)}${c.dueText ? ` · ${clipInline(c.dueText, 60)}` : ''}`))}`
      : null,
  ]);
  if (!lines) return null;
  return `${en ? 'Stored analysis of this thread (context only; the messages are the source of truth):' : 'Bu yazışmanın kayıtlı analizi (yalnızca bağlam; asıl kaynak iletilerdir):'}\n${lines}`;
}

export function replyDraft(input: ReplyDraftInput): PromptSpec<ReplyDraftAi> {
  const locale = input.locale ?? 'tr';
  const tz = input.timezone ?? DEFAULT_PROMPT_TIMEZONE;
  const en = locale === 'en';
  const firstName = clipInline(input.userFirstName, 60) || (en ? 'the user' : 'kullanıcı');
  const system = composeSystem({
    locale,
    role: en
      ? `You draft email replies on behalf of ${firstName}. The draft is shown to the user for approval; it is never sent by you.`
      : `${firstName} adına e-posta yanıtı taslağı hazırlıyorsun. Taslak kullanıcıya onay için gösterilir; sen asla göndermezsin.`,
    rules: [
      en ? TONE_RULES[input.tone].en : TONE_RULES[input.tone].tr,
      en
        ? 'Write in English unless the thread is clearly in another language; then match the thread.'
        : 'Yazışma açıkça başka bir dildeyse o dile uy; aksi halde Türkçe yaz.',
      en
        ? 'Never invent facts, availability, prices, attendees or dates the user has not stated. Where the user must decide, leave a bracketed blank like [tarih] or [saat].'
        : 'Kullanıcının söylemediği bilgi, uygunluk, fiyat, katılımcı ya da tarih uydurma. Kullanıcının karar vermesi gereken yerde [tarih] veya [saat] gibi köşeli parantezli boşluk bırak.',
      en
        ? 'Answer the points raised in the last message; use earlier messages and the stored analysis only to stay consistent with what was already said.'
        : 'Son iletide sorulan noktaları yanıtla; önceki iletileri ve kayıtlı analizi yalnızca daha önce söylenenlerle tutarlı kalmak için kullan.',
      en
        ? `Greet the recipient by name when known. Sign off with only the first name: "${firstName}".`
        : `Alıcının adı biliniyorsa adıyla selamla. Kapanışta yalnızca ad kullan: "${firstName}".`,
      en ? 'Plain text only: no markdown, no bullet symbols, no subject line inside the body.' : 'Sadece düz metin: markdown yok, madde işareti yok, gövdede konu satırı yok.',
      en ? 'subject: keep the thread subject, prefixed with "Re: " if missing.' : 'subject: yazışmanın konusunu koru; yoksa başına "Re: " ekle.',
      en ? 'basedOnIds: the message ids the draft relies on.' : "basedOnIds: taslağın dayandığı ileti id'leri.",
      en ? `tone must equal "${input.tone}".` : `tone alanı "${input.tone}" olmalı.`,
    ],
    sections: [{ title: en ? 'Context' : 'Bağlam', body: temporalContext({ now: input.now, locale, timezone: tz }) }],
  });
  const messages = capList([...input.thread.messages].slice(-REPLY_THREAD_MESSAGE_MAX), REPLY_THREAD_MESSAGE_MAX, locale);
  const body = messages.items
    .map((m) =>
      joinLines([
        `--- id: ${m.id} · ${personLabel(m.from)} · ${formatPromptDateTime(m.sentAt, tz, locale)}${m.isFromUser ? (en ? ' · (user)' : ' · (kullanıcı)') : ''}`,
        redactForPrompt(m.body, { purpose: 'reply_draft', locale }),
      ]),
    )
    .join('\n\n');
  const context = joinLines([
    labelled(en ? 'Subject' : 'Konu', clipInline(input.thread.subject, 200)),
    input.recipient ? labelled(en ? 'Reply to' : 'Yanıt alıcısı', personLabel(input.recipient)) : null,
    input.userEmails?.length ? `${en ? 'User addresses' : 'Kullanıcının adresleri'}: ${input.userEmails.join(', ')}` : null,
    analysisBlock(input.analysis, locale),
    '',
    body,
  ]);
  const instruction = input.instructions?.trim() ? clipInline(input.instructions, 500) : null;
  return {
    purpose: 'reply_draft',
    tier: input.tone === 'short' ? 'small' : 'large',
    locale,
    system,
    user: joinLines([
      en ? 'Draft a reply to the last message in the thread below.' : 'Aşağıdaki yazışmadaki son iletiye bir yanıt taslağı hazırla.',
      instruction ? (en ? `User instruction: ${instruction}` : `Kullanıcının isteği: ${instruction}`) : null,
    ]),
    context,
    schema: replyDraftAiSchema,
    maxOutputTokens: input.tone === 'detailed' ? 1500 : 800,
    temperature: 0.4,
  };
}
