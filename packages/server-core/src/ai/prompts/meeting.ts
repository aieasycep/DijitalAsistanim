/** Meeting prep grounded in invite, emails, notes and commitments (schedule suggestions live in schedule.ts). */
import type { CommitmentDirection } from '@da/domain';
import { meetingPrepAiSchema, type MeetingPrepAi } from '@da/validation';
import { PROMPT_CHAR_LIMITS, redactForPrompt } from '../redact';
import type { PromptSpec } from '../types';
import {
  DEFAULT_PROMPT_TIMEZONE,
  bullets,
  capList,
  clipInline,
  composeSystem,
  formatPromptDateTime,
  formatPromptTime,
  joinLines,
  labelled,
  personLabel,
  temporalContext,
  type PromptBase,
  type PromptParticipant,
} from './shared';

// ---------------------------------------------------------------------------
// meetingPrep
// ---------------------------------------------------------------------------

export interface MeetingPrepInput extends PromptBase {
  userName: string;
  event: {
    id: string;
    title: string;
    startAt: string;
    endAt: string;
    location?: string | null;
    description?: string | null;
    meetingUrl?: string | null;
    attendees: (PromptParticipant & { isOrganizer?: boolean })[];
  };
  primaryPerson?: {
    name: string;
    company?: string | null;
    title?: string | null;
    relation?: string | null;
  } | null;
  lastContact?: { at: string; summary: string; sourceId: string } | null;
  emails: {
    id: string;
    subject: string;
    from: PromptParticipant;
    sentAt: string;
    excerpt: string;
  }[];
  commitments: {
    id: string;
    text: string;
    direction: CommitmentDirection;
    dueText?: string | null;
    counterpart?: string | null;
  }[];
  notes?: { id: string; text: string; at: string }[];
  files?: { id: string; name: string }[];
}

export function meetingPrep(input: MeetingPrepInput): PromptSpec<MeetingPrepAi> {
  const locale = input.locale ?? 'tr';
  const tz = input.timezone ?? DEFAULT_PROMPT_TIMEZONE;
  const en = locale === 'en';
  const perExcerpt = PROMPT_CHAR_LIMITS.meeting_prep;
  const system = composeSystem({
    locale,
    role: en
      ? `You prepare ${input.userName} for an upcoming meeting: purpose, the two-minute summary and up to three talking points, all grounded in the provided sources.`
      : `${input.userName} adlı kullanıcıyı yaklaşan bir toplantıya hazırlıyorsun: amaç, iki dakikalık özet ve en fazla üç konuşma noktası; hepsi verilen kaynaklara dayanmalı.`,
    rules: [
      en
        ? 'purpose: one sentence on why this meeting exists, taken from the invite and the emails; if unclear say so.'
        : 'purpose: davet ve e-postalardan çıkan, toplantının neden yapıldığını söyleyen tek cümle; belirsizse bunu söyle.',
      en
        ? 'talkingPoints: 1-3 items, each with the source id it comes from (sourceId). No generic advice.'
        : "talkingPoints: 1-3 madde; her biri dayandığı kaynağın id'sini taşısın (sourceId). Genel tavsiye yok.",
      en
        ? 'twoMinuteSummary: a calm briefing the user can read in two minutes; plain sentences, no markdown.'
        : 'twoMinuteSummary: kullanıcının iki dakikada okuyacağı sakin bir özet; düz cümleler, markdown yok.',
      en
        ? 'relevantEmailIds and openLoops must use the ids given; do not invent attendees, dates, files or agreements.'
        : "relevantEmailIds ve openLoops verilen id'leri kullanmalı; katılımcı, tarih, dosya ya da anlaşma uydurma.",
      en
        ? 'Open loops are things one side still owes the other; list them only when a source shows them.'
        : 'Açık işler, bir tarafın diğerine hâlâ borçlu olduğu şeylerdir; yalnızca kaynak gösteriyorsa listele.',
    ],
    sections: [
      {
        title: en ? 'Context' : 'Bağlam',
        body: temporalContext({ now: input.now, locale, timezone: tz }),
      },
    ],
  });
  const ev = input.event;
  const emails = capList(input.emails, 8, locale);
  const notes = capList(input.notes ?? [], 4, locale);
  const context = joinLines([
    en ? 'Meeting:' : 'Toplantı:',
    `id: ${ev.id}`,
    labelled(en ? 'Title' : 'Başlık', clipInline(ev.title, 160)),
    labelled(
      en ? 'When' : 'Ne zaman',
      `${formatPromptDateTime(ev.startAt, tz, locale)} – ${formatPromptTime(ev.endAt, tz)}`,
    ),
    labelled(en ? 'Where' : 'Nerede', ev.location ? clipInline(ev.location, 160) : null),
    ev.meetingUrl
      ? en
        ? 'Online meeting link present.'
        : 'Çevrimiçi toplantı bağlantısı var.'
      : null,
    labelled(
      en ? 'Attendees' : 'Katılımcılar',
      ev.attendees
        .map(
          (a) => `${personLabel(a)}${a.isOrganizer ? (en ? ' (organizer)' : ' (düzenleyen)') : ''}`,
        )
        .join(', '),
    ),
    ev.description
      ? `${en ? 'Description' : 'Açıklama'}: ${redactForPrompt(ev.description, { maxChars: perExcerpt, locale, keepSignature: true })}`
      : null,
    input.primaryPerson
      ? `${en ? 'Primary person' : 'Ana kişi'}: ${[
          input.primaryPerson.name,
          input.primaryPerson.title,
          input.primaryPerson.company,
          input.primaryPerson.relation,
        ]
          .filter(Boolean)
          .map((s) => clipInline(s, 80))
          .join(' · ')}`
      : null,
    input.lastContact
      ? `${en ? 'Last contact' : 'Son temas'} (id: ${input.lastContact.sourceId}, ${formatPromptDateTime(input.lastContact.at, tz, locale)}): ${clipInline(input.lastContact.summary, 300)}`
      : null,
    '',
    emails.items.length ? (en ? 'Related emails:' : 'İlgili e-postalar:') : null,
    ...emails.items.map(
      (e) =>
        `[${e.id}] ${personLabel(e.from)} · ${formatPromptDateTime(e.sentAt, tz, locale)} · ${clipInline(e.subject, 120)}\n${redactForPrompt(e.excerpt, { maxChars: perExcerpt, locale })}`,
    ),
    emails.note,
    input.commitments.length
      ? `\n${en ? 'Commitments' : 'Taahhütler'}:\n${bullets(input.commitments.slice(0, 10).map((c) => `[${c.id}] ${c.direction} · ${clipInline(c.text, 160)}${c.dueText ? ` · ${clipInline(c.dueText, 60)}` : ''}${c.counterpart ? ` · ${clipInline(c.counterpart, 60)}` : ''}`))}`
      : null,
    notes.items.length
      ? `\n${en ? 'Notes' : 'Notlar'}:\n${bullets(notes.items.map((n) => `[${n.id}] ${formatPromptDateTime(n.at, tz, locale)}: ${redactForPrompt(n.text, { maxChars: perExcerpt, locale, keepSignature: true })}`))}`
      : null,
    notes.note,
    input.files?.length
      ? `\n${en ? 'Files' : 'Dosyalar'}:\n${bullets(input.files.slice(0, 8).map((f) => `[${f.id}] ${clipInline(f.name, 100)}`))}`
      : null,
  ]);
  return {
    purpose: 'meeting_prep',
    tier: 'large',
    locale,
    system,
    user: en
      ? 'Prepare the meeting brief from the sources below.'
      : 'Aşağıdaki kaynaklardan toplantı hazırlığını çıkar.',
    context,
    schema: meetingPrepAiSchema,
    maxOutputTokens: 1800,
    temperature: 0.3,
  };
}
