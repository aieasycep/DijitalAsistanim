/**
 * Commitment extraction from user-authored text (sent mail, meeting notes, captures). Every
 * commitment must carry a verbatim quote; dates are only accepted with their evidence phrase.
 */
import { commitmentExtractionAiSchema, type CommitmentExtractionAi } from '@da/validation';
import { redactForPrompt } from '../redact';
import type { PromptSpec } from '../types';
import {
  DEFAULT_PROMPT_TIMEZONE,
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

export type CommitmentSourceKind = 'email' | 'meeting_note' | 'capture' | 'assistant';

export interface CommitmentExtractionInput extends PromptBase {
  userName: string;
  source: {
    kind: CommitmentSourceKind;
    id: string;
    sentAt?: string | null;
    from?: PromptParticipant | null;
    to?: PromptParticipant[] | null;
    subject?: string | null;
    /** True when the user wrote the text (email sent by the user, the user's own note). */
    isFromUser?: boolean;
  };
  text: string;
  counterpartName?: string | null;
}

export function commitmentExtraction(input: CommitmentExtractionInput): PromptSpec<CommitmentExtractionAi> {
  const locale = input.locale ?? 'tr';
  const tz = input.timezone ?? DEFAULT_PROMPT_TIMEZONE;
  const en = locale === 'en';
  const userName = clipInline(input.userName, 80) || (en ? 'the user' : 'kullanıcı');
  const authorNote = input.source.isFromUser
    ? en
      ? `The text was written by the user (${userName}); first-person promises ("I will send", "I'll call") are user_owes. Things the user asks others to do are other_owes only when the other side agreed in the same text.`
      : `Metni kullanıcı (${userName}) yazdı; birinci tekil şahıs sözler ("göndereceğim", "arayacağım") user_owes. Kullanıcının başkasından istedikleri, ancak karşı taraf aynı metinde kabul ettiyse other_owes olur.`
    : en
      ? `The text was written by someone else; their promises are other_owes, requests addressed to ${userName} that the user accepted are user_owes.`
      : `Metni başkası yazdı; onların sözleri other_owes, ${userName} adlı kullanıcının kabul ettiği istekler user_owes.`;
  const system = composeSystem({
    locale,
    role: en
      ? 'You extract concrete commitments ("I will send the proposal on Friday") from a message or meeting note.'
      : 'Bir ileti ya da toplantı notundan somut taahhütleri ("teklifi cuma göndereceğim") çıkarıyorsun.',
    rules: [
      en
        ? 'A commitment is a clear promise or agreed action with an owner. Vague intentions ("we should meet sometime") are not commitments.'
        : 'Taahhüt, sahibi belli net bir söz ya da üzerinde anlaşılmış eylemdir. Belirsiz niyetler ("bir ara görüşelim") taahhüt değildir.',
      authorNote,
      en
        ? 'quote must be the verbatim source sentence, copied character for character. text is a short imperative summary ("Mehmet\'e teklifi gönder").'
        : 'quote kaynaktaki cümlenin birebir, karakteri karakterine alıntısı olmalı. text kısa bir emir cümlesi olsun ("Mehmet\'e teklifi gönder").',
      en
        ? 'due: only when a time is stated; resolve relative phrases from the message date, keep the phrase in due.text and put the source words in due.evidence. If the date is ambiguous set due.iso to null.'
        : 'due: yalnızca zaman belirtilmişse; göreli ifadeleri ileti tarihinden hesapla, ifadeyi due.text içinde tut, kaynaktaki sözcükleri due.evidence alanına yaz. Tarih belirsizse due.iso null olsun.',
      en ? "counterpart is the other person's name when known; never guess a name." : 'counterpart, biliniyorsa karşı tarafın adı; asla ad tahmin etme.',
      en
        ? 'confidence per commitment: high only when the promise, its owner and its wording are unambiguous.'
        : 'Her taahhüt için confidence: yalnızca söz, sahibi ve ifadesi netse yüksek olsun.',
      en ? 'Return at most 6 commitments; an empty list is a valid answer.' : 'En fazla 6 taahhüt döndür; boş liste geçerli bir yanıttır.',
    ],
    sections: [{ title: en ? 'Context' : 'Bağlam', body: temporalContext({ now: input.now, locale, timezone: tz }) }],
  });
  const context = joinLines([
    `${en ? 'Source' : 'Kaynak'}: ${input.source.kind} · id: ${input.source.id}`,
    input.source.sentAt ? labelled(en ? 'Date' : 'Tarih', formatPromptDateTime(input.source.sentAt, tz, locale)) : null,
    input.source.from ? labelled(en ? 'From' : 'Kimden', personLabel(input.source.from)) : null,
    input.source.to?.length ? labelled(en ? 'To' : 'Kime', input.source.to.map(personLabel).join(', ')) : null,
    input.source.subject ? labelled(en ? 'Subject' : 'Konu', clipInline(input.source.subject, 200)) : null,
    input.counterpartName ? labelled(en ? 'Counterpart' : 'Karşı taraf', clipInline(input.counterpartName, 120)) : null,
    '',
    redactForPrompt(input.text, { purpose: 'commitment_extraction', locale, keepSignature: input.source.kind !== 'email' }),
  ]);
  return {
    purpose: 'commitment_extraction',
    tier: 'small',
    locale,
    system,
    user: en ? 'Extract the commitments from the text below.' : 'Aşağıdaki metindeki taahhütleri çıkar.',
    context,
    schema: commitmentExtractionAiSchema,
    maxOutputTokens: 900,
    temperature: 0.1,
  };
}
