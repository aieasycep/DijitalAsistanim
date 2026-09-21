/** Assistant (RAG) answers grounded in retrieved chunks (voice intent and capture analysis live in voice.ts / capture.ts). */
import { assistantAnswerAiSchema, type AssistantAnswerAi } from '@da/validation';
import { PROMPT_CHAR_LIMITS, redactForPrompt } from '../redact';
import type { PromptSpec } from '../types';
import {
  DEFAULT_PROMPT_TIMEZONE,
  capList,
  clipInline,
  composeSystem,
  formatPromptDateTime,
  joinLines,
  temporalContext,
  type PromptBase,
} from './shared';

// ---------------------------------------------------------------------------
// assistantAnswer
// ---------------------------------------------------------------------------

export type AssistantChunkKind =
  'email' | 'event' | 'person' | 'commitment' | 'life_event' | 'memory' | 'task' | 'plan_block';

export interface AssistantChunk {
  id: string;
  kind: AssistantChunkKind;
  /** "Gmail · Ahmet Yılmaz" */
  label: string;
  person?: string | null;
  at?: string | null;
  text: string;
}

export interface AssistantAnswerInput extends PromptBase {
  userName: string;
  question: string;
  /** Previous turns, oldest first (kept short). */
  history?: { role: 'user' | 'assistant'; content: string }[];
  chunks: AssistantChunk[];
  /** Person-scoped thread. */
  contactName?: string | null;
  capabilities?: { canSendMail: boolean; canWriteCalendar: boolean; canCreateTasks: boolean };
}

export function assistantAnswer(input: AssistantAnswerInput): PromptSpec<AssistantAnswerAi> {
  const locale = input.locale ?? 'tr';
  const tz = input.timezone ?? DEFAULT_PROMPT_TIMEZONE;
  const en = locale === 'en';
  const caps = input.capabilities;
  const capLine = caps
    ? en
      ? `Write permissions granted by the user: mail ${caps.canSendMail ? 'yes' : 'no'}, calendar ${caps.canWriteCalendar ? 'yes' : 'no'}, tasks ${caps.canCreateTasks ? 'yes' : 'no'}. A missing permission means the approval card will ask for it; still produce the draft.`
      : `Kullanıcının verdiği yazma izinleri: mail ${caps.canSendMail ? 'var' : 'yok'}, takvim ${caps.canWriteCalendar ? 'var' : 'yok'}, görev ${caps.canCreateTasks ? 'var' : 'yok'}. İzin yoksa onay kartı izni ister; taslağı yine de üret.`
    : null;
  const system = composeSystem({
    locale,
    role: en
      ? `You are Dijital Asistan, ${input.userName}'s personal assistant. Answer questions using only the retrieved sources below. You never send mail, never change the calendar and never create anything yourself: write intents become drafts the user approves.`
      : `Sen Dijital Asistan'sın, ${input.userName} adlı kullanıcının kişisel asistanı. Soruları yalnızca aşağıdaki kaynaklara dayanarak yanıtla. Sen asla mail göndermez, takvimi değiştirmez, hiçbir şey oluşturmazsın: yazma niyetleri kullanıcının onaylayacağı taslaklara dönüşür.`,
    rules: [
      en
        ? 'citedSourceIds: the ids of the chunks your answer relies on. Only provided ids. If no chunk supports the answer, keep it generic, set uncertain=true and say the source does not confirm it.'
        : "citedSourceIds: yanıtının dayandığı parçaların id'leri. Yalnızca verilen id'ler. Hiçbir parça yanıtı desteklemiyorsa genel konuş, uncertain=true yap ve kaynağın bunu doğrulamadığını söyle.",
      en
        ? 'answer: 1-4 plain sentences, natural and calm, no markdown. Mention people by name as they appear in the sources.'
        : 'answer: 1-4 düz cümle, doğal ve sakin, markdown yok. Kişileri kaynaklarda geçtiği gibi adıyla an.',
      en
        ? 'cards: up to 5 entities from the chunks worth showing (email, event, person, commitment, life_event, plan_block) using their ids.'
        : "cards: parçalardan gösterilmeye değer en fazla 5 varlık (email, event, person, commitment, life_event, plan_block), id'leriyle.",
      en
        ? 'writeIntents: when the user asks to send, schedule, remind or create, produce a draft (type, what, why, draft fields) and say in the answer that it will be shown for approval. Never claim it was done.'
        : 'writeIntents: kullanıcı gönder, planla, hatırlat ya da oluştur derse taslak üret (type, what, why, draft alanları) ve yanıtta onayına sunulacağını söyle. Asla yapıldığını iddia etme.',
      en
        ? 'For a draft, include only fields the user provided or the sources show; leave the rest for the user to fill.'
        : 'Taslakta yalnızca kullanıcının verdiği ya da kaynakların gösterdiği alanları doldur; kalanını kullanıcıya bırak.',
      en
        ? 'suggestedFollowUps: up to 3 short next questions the user might ask.'
        : 'suggestedFollowUps: kullanıcının sorabileceği en fazla 3 kısa sonraki soru.',
    ],
    sections: [
      {
        title: en ? 'Context' : 'Bağlam',
        body: joinLines([
          temporalContext({ now: input.now, locale, timezone: tz }),
          input.contactName
            ? `${en ? 'This conversation is about' : 'Bu sohbet şu kişi hakkında'}: ${clipInline(input.contactName, 120)}`
            : null,
          capLine,
        ]),
      },
    ],
  });
  const perChunk = PROMPT_CHAR_LIMITS.assistant_answer;
  const chunks = capList(input.chunks, 12, locale);
  const history = (input.history ?? []).slice(-6);
  const context = joinLines([
    history.length ? (en ? 'Conversation so far:' : 'Şimdiye kadarki sohbet:') : null,
    ...history.map(
      (h) =>
        `${h.role === 'user' ? (en ? 'User' : 'Kullanıcı') : en ? 'Assistant' : 'Asistan'}: ${clipInline(h.content, 500)}`,
    ),
    history.length ? '' : null,
    chunks.items.length
      ? en
        ? 'Retrieved sources:'
        : 'Bulunan kaynaklar:'
      : en
        ? 'Retrieved sources: (none)'
        : 'Bulunan kaynaklar: (yok)',
    ...chunks.items.map(
      (c) =>
        `[${c.id}] kind=${c.kind} · ${clipInline(c.label, 80)}${c.person ? ` · ${clipInline(c.person, 60)}` : ''}${c.at ? ` · ${formatPromptDateTime(c.at, tz, locale)}` : ''}\n${redactForPrompt(c.text, { maxChars: perChunk, locale, keepSignature: true })}`,
    ),
    chunks.note,
  ]);
  return {
    purpose: 'assistant_answer',
    tier: 'large',
    locale,
    system,
    user: `${en ? 'Question' : 'Soru'}: ${clipInline(input.question, 2000)}`,
    context,
    schema: assistantAnswerAiSchema,
    maxOutputTokens: 1500,
    temperature: 0.3,
  };
}
