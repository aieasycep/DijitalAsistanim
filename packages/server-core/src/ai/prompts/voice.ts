/**
 * Voice intent: a short transcript becomes one of question / read_briefing / write_action /
 * navigate / unknown. Write actions are drafts only; the model never executes anything.
 */
import { voiceIntentAiSchema, type VoiceIntentAi } from '@da/validation';
import { PROMPT_CHAR_LIMITS } from '../redact';
import type { PromptSpec } from '../types';
import { DEFAULT_PROMPT_TIMEZONE, clipInline, composeSystem, joinLines, temporalContext, type PromptBase } from './shared';

/** App screens a voice command may open when the caller does not pass its own list. */
export const DEFAULT_VOICE_SCREENS = ['today', 'flow', 'plan', 'mail', 'people', 'settings'] as const;

export interface VoiceIntentInput extends PromptBase {
  transcript: string;
  /** App screens the user can navigate to ("today", "plan", "mail", "people", "settings"). */
  screens?: string[];
  /** Person-scoped voice session ("Mehmet hakkında sor…"). */
  contactName?: string | null;
}

export function voiceIntent(input: VoiceIntentInput): PromptSpec<VoiceIntentAi> {
  const locale = input.locale ?? 'tr';
  const tz = input.timezone ?? DEFAULT_PROMPT_TIMEZONE;
  const en = locale === 'en';
  const screens = input.screens?.length ? input.screens.map((s) => clipInline(s, 40)) : [...DEFAULT_VOICE_SCREENS];
  const system = composeSystem({
    locale,
    role: en
      ? 'You classify a short voice transcript into one intent for a personal assistant app. Transcripts may contain recognition errors; be tolerant but never guess facts.'
      : 'Kısa bir sesli komut dökümünü kişisel asistan uygulaması için tek bir niyete ayırıyorsun. Dökümde tanıma hataları olabilir; hoşgörülü ol ama olgu uydurma.',
    rules: [
      en
        ? 'intent: question (asks about mail, calendar, people, tasks), read_briefing (wants the briefing read aloud), write_action (send, schedule, remind, create task/commitment), navigate (open a screen), unknown.'
        : 'intent: question (mail, takvim, kişi, görev sorar), read_briefing (brifing sesli okunsun ister), write_action (gönder, planla, hatırlat, görev/taahhüt oluştur), navigate (bir ekran açsın), unknown.',
      en ? `navigateTo must be one of: ${screens.join(', ')}; null for any other intent.` : `navigateTo şu değerlerden biri olmalı: ${screens.join(', ')}; diğer niyetlerde null.`,
      en ? 'question: the cleaned-up question text when intent=question.' : 'question: intent=question ise temizlenmiş soru metni.',
      en
        ? 'writeAction: a draft only (type, what, why, draft fields from the transcript). It is never executed by you; the user approves it. Put only what was said into draft; use null for unknown times, recipients or amounts.'
        : 'writeAction: yalnızca taslak (type, what, why, döküm içindeki draft alanları). Sen asla uygulamazsın; kullanıcı onaylar. draft içine yalnızca söyleneni koy; bilinmeyen zaman, alıcı ya da tutar için null.',
      en
        ? 'writeAction.type: email_send, calendar_create, calendar_update, task_create, reminder_create or commitment_create. Resolve relative times ("yarın 10\'da") from the current time into ISO 8601 UTC inside draft.'
        : "writeAction.type: email_send, calendar_create, calendar_update, task_create, reminder_create ya da commitment_create. Göreli zamanları (\"yarın 10'da\") şu andan hesaplayıp draft içinde ISO 8601 UTC olarak yaz.",
      en
        ? 'When the transcript is empty, unclear or not addressed to the assistant return intent=unknown with low confidence.'
        : 'Döküm boş, anlaşılmaz ya da asistana yönelik değilse düşük confidence ile intent=unknown döndür.',
    ],
    sections: [
      {
        title: en ? 'Context' : 'Bağlam',
        body: joinLines([
          temporalContext({ now: input.now, locale, timezone: tz }),
          input.contactName ? `${en ? 'This voice session is about' : 'Bu sesli oturum şu kişi hakkında'}: ${clipInline(input.contactName, 120)}` : null,
        ]),
      },
    ],
  });
  return {
    purpose: 'voice_intent',
    tier: 'small',
    locale,
    system,
    user: en ? 'Classify the transcript below.' : 'Aşağıdaki dökümü sınıflandır.',
    context: `${en ? 'Transcript' : 'Döküm'}: "${clipInline(input.transcript, PROMPT_CHAR_LIMITS.voice_intent)}"`,
    schema: voiceIntentAiSchema,
    maxOutputTokens: 500,
    temperature: 0.1,
  };
}
