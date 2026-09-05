/** Briefing narration. The model may only reference candidate ids we supply (suggested questions live in questions.ts). */
import { BRIEFING_SECTIONS, type BriefingCounts, type BriefingKind, type BriefingSection, type Importance, type WeeklyMetrics } from '@da/domain';
import { briefingAiSchema, type BriefingAi } from '@da/validation';
import { AppError } from '../../errors';
import { PROMPT_CHAR_LIMITS } from '../redact';
import type { PromptSpec } from '../types';
import { DEFAULT_PROMPT_TIMEZONE, bullets, capList, clipInline, composeSystem, formatPromptDate, formatPromptTime, joinLines, temporalContext, type PromptBase } from './shared';

export const BRIEFING_CANDIDATE_MAX = 40;

export interface BriefingCandidate {
  id: string;
  section: BriefingSection;
  title: string;
  meta?: string | null;
  /** ISO instant the item relates to (event start, deadline) — optional. */
  at?: string | null;
  importance?: Importance;
  /** Source label shown to the user ("Gmail · Ahmet Yılmaz"). */
  source?: string | null;
}

export interface BriefingPromptInput extends PromptBase {
  kind: BriefingKind;
  /** Local date (YYYY-MM-DD) the briefing is for. */
  date: string;
  userName: string;
  counts: BriefingCounts;
  candidates: BriefingCandidate[];
  /** Midday: what changed since the morning briefing (short lines). */
  changesSinceMorning?: string[];
  /** Evening: what the user finished today. */
  completedToday?: string[];
  weekly?: Partial<WeeklyMetrics> | null;
  /** Learned briefing focus statements (lower authority than explicit rules). */
  focus?: string[];
}

const KIND_GUIDANCE: Record<BriefingKind, { tr: string[]; en: string[] }> = {
  morning: {
    tr: [
      'Sabah brifingi: güne hazırla. Sıra: priorities, schedule, waiting_for_you, waiting_for_others, deadlines, personal.',
      'headline "Bugün bilmen gereken N şey var." kalıbında olsun; highlightNumber öne çıkardığın öğe sayısıdır.',
    ],
    en: [
      'Morning briefing: prepare the user for the day. Order: priorities, schedule, waiting_for_you, waiting_for_others, deadlines, personal.',
      'headline follows "There are N things you should know today."; highlightNumber is the count of items you feature.',
    ],
  },
  midday: {
    tr: [
      'Öğle nabzı: yalnızca sabahtan beri değişenleri ve günün kalanını anlat. Sıra: changes, rest_of_day.',
      'Değişiklik yoksa headline tek satır olsun ("Sabahtan beri yeni bir şey yok."), sections boş kalabilir.',
    ],
    en: [
      'Midday pulse: only what changed since the morning and the rest of the day. Order: changes, rest_of_day.',
      'If nothing changed, headline is a single line ("Nothing new since this morning.") and sections may be empty.',
    ],
  },
  evening: {
    tr: [
      'Akşam kapanışı: bugün biteni takdir et, yarına taşınanları ve yarının ilk etkinliğini söyle. Sıra: completed, carried_over, follow_ups, first_event_tomorrow.',
      'mood, günü sakin bir cümleyle kapatsın; yarın için tek bir hazırlık önerisi yeter.',
    ],
    en: [
      'Evening close: acknowledge what got done, list what carries over and tomorrow\'s first event. Order: completed, carried_over, follow_ups, first_event_tomorrow.',
      'mood closes the day with one calm sentence; one preparation tip for tomorrow is enough.',
    ],
  },
  weekly: {
    tr: [
      'Haftalık özet: verilen metriklerle haftayı anlat, gelecek hafta için outlook yaz. Sıra: priorities, deadlines, follow_ups, schedule.',
      'Sayıları yalnızca counts ve weekly alanlarından al; kendin hesaplama.',
    ],
    en: [
      'Weekly digest: narrate the week from the given metrics and write an outlook for next week. Order: priorities, deadlines, follow_ups, schedule.',
      'Take every number from counts and weekly only; never compute your own.',
    ],
  },
};

function candidateLine(c: BriefingCandidate, tz: string): string {
  const perItem = PROMPT_CHAR_LIMITS.briefing;
  const parts = [`[${c.id}]`, `section=${c.section}`, clipInline(c.title, perItem)];
  if (c.at) parts.push(`at=${formatPromptTime(c.at, tz)}`);
  if (c.importance) parts.push(`importance=${c.importance}`);
  if (c.meta) parts.push(`meta=${clipInline(c.meta, 120)}`);
  if (c.source) parts.push(`source=${clipInline(c.source, 60)}`);
  return parts.join(' | ');
}

export function briefing(input: BriefingPromptInput): PromptSpec<BriefingAi> {
  const locale = input.locale ?? 'tr';
  const tz = input.timezone ?? DEFAULT_PROMPT_TIMEZONE;
  const en = locale === 'en';
  if (input.candidates.length > BRIEFING_CANDIDATE_MAX) {
    throw new AppError('validation', en ? `At most ${BRIEFING_CANDIDATE_MAX} candidates.` : `En fazla ${BRIEFING_CANDIDATE_MAX} aday öğe.`, {
      details: { count: input.candidates.length, max: BRIEFING_CANDIDATE_MAX },
    });
  }
  const guidance = en ? KIND_GUIDANCE[input.kind].en : KIND_GUIDANCE[input.kind].tr;
  const system = composeSystem({
    locale,
    role: en
      ? `You write the ${input.kind} briefing of Dijital Asistan for ${input.userName}: a short editorial that tells the user what they need to know, without them asking.`
      : `Sen Dijital Asistan'ın ${input.userName} için ${input.kind} brifingini yazıyorsun: kullanıcının bilmesi gerekenleri, o sormadan söyleyen kısa bir anlatı.`,
    rules: [
      ...guidance,
      en
        ? 'You may only reference the candidate ids you are given. sections[].itemIds must be candidate ids, each used at most once; never invent an item, a number or a time.'
        : 'Yalnızca sana verilen aday id\'lerine atıf yapabilirsin. sections[].itemIds aday id\'lerinden oluşmalı, her id en fazla bir kez; öğe, sayı ya da saat uydurma.',
      en
        ? `sections[].section must be one of: ${BRIEFING_SECTIONS.join(', ')}. Skip empty sections.`
        : `sections[].section şu değerlerden biri olmalı: ${BRIEFING_SECTIONS.join(', ')}. Boş bölümleri atla.`,
      en
        ? 'subline is a dot-separated count line built from counts ("3 önemli mail · 4 etkinlik · 2 takip").'
        : 'subline, counts alanından üretilen nokta ayraçlı sayım satırıdır ("3 önemli mail · 4 etkinlik · 2 takip").',
      en
        ? 'narrative: 2-4 warm, plain sentences addressing the user by first name once; no lists, no markdown.'
        : 'narrative: kullanıcıya bir kez adıyla seslenen 2-4 sıcak, sade cümle; liste yok, markdown yok.',
      en
        ? 'audioScript: up to 6 chapters read aloud by text-to-speech; plain sentences, times as "saat 14:00", no symbols.'
        : 'audioScript: sesli okunacak en fazla 6 bölüm; düz cümleler, saatler "saat 14:00" biçiminde, sembol yok.',
      en
        ? 'Do not exaggerate urgency. If the day is calm say so plainly.'
        : 'Aciliyeti abartma. Gün sakinse bunu düz biçimde söyle.',
    ],
    sections: [
      {
        title: en ? 'Context' : 'Bağlam',
        body: joinLines([
          temporalContext({ now: input.now, locale, timezone: tz }),
          `${en ? 'Briefing date' : 'Brifing tarihi'}: ${formatPromptDate(`${input.date}T12:00:00Z`, 'UTC', locale)} (${input.date})`,
          input.focus?.length ? `${en ? 'Learned focus' : 'Öğrenilen odak'}:\n${bullets(input.focus.slice(0, 6))}` : null,
        ]),
      },
    ],
  });
  const candidates = capList(input.candidates, BRIEFING_CANDIDATE_MAX, locale);
  const context = joinLines([
    `counts: ${JSON.stringify(input.counts)}`,
    input.weekly ? `weekly: ${JSON.stringify(input.weekly)}` : null,
    input.changesSinceMorning?.length ? `${en ? 'Changes since morning' : 'Sabahtan beri değişenler'}:\n${bullets(input.changesSinceMorning.slice(0, 12).map((s) => clipInline(s, 160)))}` : null,
    input.completedToday?.length ? `${en ? 'Completed today' : 'Bugün tamamlananlar'}:\n${bullets(input.completedToday.slice(0, 12).map((s) => clipInline(s, 160)))}` : null,
    '',
    en ? 'Candidates:' : 'Adaylar:',
    ...candidates.items.map((c) => candidateLine(c, tz)),
    candidates.note,
  ]);
  return {
    purpose: 'briefing',
    tier: 'large',
    locale,
    system,
    user: en
      ? `Write the ${input.kind} briefing for ${input.date} using only the candidates below.`
      : `${input.date} için ${input.kind} brifingini yalnızca aşağıdaki adayları kullanarak yaz.`,
    context,
    schema: briefingAiSchema,
    maxOutputTokens: 2500,
    temperature: 0.5,
  };
}
