/**
 * POST /meeting-prep { eventId, regenerate? } — Meeting Prep (the signature feature): who, when, purpose,
 * last contact, relevant mail, open loops, promises both ways, files, 3 talking points and a two-minute
 * summary — every line grounded in the user's own data. Cached on the event (prep / prep_generated_at);
 * regenerated when the event moved or the user asks. Pro feature (meeting_prep).
 */
import { z } from 'zod';
import type {
  CalendarEvent,
  Commitment,
  Contact,
  EmailMessage,
  EmailThread,
  MeetingPrep,
  SourceRef,
} from '@da/domain';
import { meetingPrepAiSchema } from '@da/validation';
import { meetingPrep as meetingPrepPrompt } from '@da/server-core/ai';
import { createRoutesProvider, leaveByTime } from '@da/server-core/calendar';
import { AppError } from '@da/server-core/errors';
import { aiConfigured, checkAiBudget, createAi } from '../_shared/ai.ts';
import { loadUserContext } from '../_shared/context.ts';
import {
  adminClient,
  assertMethod,
  enforceRateLimit,
  getEnv,
  handler,
  json,
  parseInput,
  requireUser,
  uuidParam,
} from '../_shared/mod.ts';
import { log } from '../_shared/log.ts';
import { resolvePlan } from '../_shared/plan.ts';
import { camelize } from '../_shared/rows.ts';

const schema = z.object({ eventId: uuidParam, regenerate: z.boolean().optional() });

function sourceForThread(
  thread: EmailThread,
  sourceType: SourceRef['type'],
  person: string | null,
): SourceRef {
  return {
    type: sourceType,
    id: thread.id,
    externalId: thread.externalThreadId,
    label: sourceType === 'outlook' ? 'Outlook' : 'Gmail',
    person: person ?? undefined,
    timestamp: thread.lastMessageAt,
    excerpt: thread.snippet.slice(0, 280),
  };
}

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'POST');
    const { user } = await requireUser(req);
    const input = await parseInput(req, schema);
    const admin = adminClient();
    const [ctx, plan] = await Promise.all([
      loadUserContext(admin, user.id),
      resolvePlan(admin, user.id),
    ]);
    if (plan.plan !== 'pro')
      throw new AppError('forbidden', 'Toplantı hazırlığı Pro planına dahil.', {
        details: { feature: 'meeting_prep' },
      });

    const { data: eventRow } = await admin
      .from('calendar_events')
      .select('*')
      .eq('id', input.eventId)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!eventRow) throw new AppError('not_found', 'Etkinlik bulunamadı.');
    const event = camelize<CalendarEvent>(eventRow);
    const cached = (eventRow as { prep?: Omit<MeetingPrep, 'event'> | null }).prep ?? null;
    if (
      cached &&
      !input.regenerate &&
      event.prepGeneratedAt &&
      Date.parse(event.prepGeneratedAt) > Date.parse(event.updatedAt) - 1000
    ) {
      return json({ ...cached, event });
    }
    await enforceRateLimit('ai_call', user.id);
    const now = new Date().toISOString();

    const others = event.attendees
      .filter((a) => !a.isOrganizer || !event.organizerIsUser)
      .filter((a) => !a.email || !ctx.userEmails.includes(a.email.toLowerCase()));
    const emails = others.map((a) => a.email?.toLowerCase()).filter((e): e is string => Boolean(e));
    const primaryAttendee = others[0] ?? null;

    const [
      { data: contactRows },
      { data: threadRows },
      { data: commitmentRows },
      { data: noteRows },
    ] = await Promise.all([
      emails.length
        ? admin
            .from('contacts')
            .select('*')
            .eq('user_id', user.id)
            .is('deleted_at', null)
            .overlaps('emails', emails)
            .limit(5)
        : Promise.resolve({ data: [] }),
      admin
        .from('email_threads')
        .select('*')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .order('last_message_at', { ascending: false })
        .limit(150),
      admin
        .from('commitments')
        .select('*')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .in('status', ['open', 'proposed', 'postponed'])
        .limit(100),
      admin
        .from('post_meeting_notes')
        .select('id, text, created_at, event_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);
    const contacts = camelize<Contact[]>(contactRows ?? []);
    const primaryPerson = contacts[0] ?? null;
    const personName =
      primaryPerson?.displayName ?? primaryAttendee?.name ?? primaryAttendee?.email ?? null;
    const titleTokens = event.title
      .toLocaleLowerCase('tr-TR')
      .split(/\W+/)
      .filter((t) => t.length > 3);
    const threads = camelize<EmailThread[]>(threadRows ?? []);
    const related = threads
      .filter((t) => {
        const withPerson =
          emails.length > 0 &&
          t.participants.some((p) => p.email && emails.includes(p.email.toLowerCase()));
        const topical =
          titleTokens.length > 0 &&
          titleTokens.some((tok) => t.subject.toLocaleLowerCase('tr-TR').includes(tok));
        return withPerson || topical;
      })
      .slice(0, 8);
    const commitments = camelize<Commitment[]>(commitmentRows ?? []).filter(
      (c) =>
        (primaryPerson && c.counterpartContactId === primaryPerson.id) ||
        (personName &&
          c.counterpartName &&
          c.counterpartName.toLocaleLowerCase('tr-TR') === personName.toLocaleLowerCase('tr-TR')),
    );
    const relatedIds = related.map((t) => t.id);
    const { data: messageRows } = relatedIds.length
      ? await admin
          .from('email_messages')
          .select(
            'id, thread_id, from_participant, sent_at, snippet, body_text, attachments, has_attachments',
          )
          .eq('user_id', user.id)
          .in('thread_id', relatedIds)
          .order('sent_at', { ascending: false })
          .limit(40)
      : { data: [] };
    const messages = camelize<
      Pick<
        EmailMessage,
        | 'id'
        | 'threadId'
        | 'from'
        | 'sentAt'
        | 'snippet'
        | 'bodyText'
        | 'attachments'
        | 'hasAttachments'
      >[]
    >(
      ((messageRows ?? []) as Record<string, unknown>[]).map((m) => ({
        ...m,
        from: m.from_participant,
      })),
    );
    const personLower = personName?.toLocaleLowerCase('tr-TR') ?? null;
    const notes = (
      (noteRows ?? []) as { id: string; text: string; created_at: string; event_id: string }[]
    )
      .filter(
        (n) =>
          n.event_id === event.id ||
          (personLower !== null && n.text.toLocaleLowerCase('tr-TR').includes(personLower)),
      )
      .slice(0, 5);

    const lastThread = related[0] ?? null;
    const sourceTypeOf = (t: EmailThread) => ctx.accountSourceTypes[t.accountId] ?? 'gmail';
    const lastContact = lastThread
      ? {
          at: lastThread.lastMessageAt,
          summary: lastThread.analysis?.summary ?? lastThread.snippet,
          source: sourceForThread(lastThread, sourceTypeOf(lastThread), personName),
        }
      : null;
    const files = messages
      .filter((m) => m.hasAttachments)
      .flatMap((m) =>
        m.attachments.map((a) => ({
          name: a.filename,
          mimeType: a.mimeType,
          source: {
            type: sourceTypeOf(
              related.find((t) => t.id === m.threadId) ?? (related[0] as EmailThread),
            ),
            id: m.threadId,
            label: 'E-posta',
            timestamp: m.sentAt,
          } as SourceRef,
        })),
      )
      .slice(0, 6);

    // Deterministic base (always available)
    let prep: MeetingPrep = {
      eventId: event.id,
      event,
      primaryPerson,
      purpose: event.description?.split('\n')[0]?.slice(0, 200) || event.title,
      lastContact,
      relevantEmails: related
        .slice(0, 4)
        .map((t) => ({ thread: t, why: t.analysis?.summary ?? t.snippet.slice(0, 140) })),
      openLoops: commitments
        .filter((c) => c.direction === 'other_owes')
        .map((c) => ({ text: c.text, source: c.source })),
      userCommitments: commitments.filter((c) => c.direction === 'user_owes'),
      theirCommitments: commitments.filter((c) => c.direction === 'other_owes'),
      relevantFiles: files,
      talkingPoints: [
        ...(lastThread
          ? [
              {
                title: lastThread.subject,
                detail: lastThread.analysis?.summary ?? lastThread.snippet.slice(0, 160),
                source: sourceForThread(lastThread, sourceTypeOf(lastThread), personName),
              },
            ]
          : []),
        ...commitments.slice(0, 2).map((c) => ({
          title: c.text,
          detail: c.quote ?? c.dueText ?? (ctx.locale === 'en' ? 'Open item' : 'Açık madde'),
          source: c.source,
        })),
      ].slice(0, 3),
      twoMinuteSummary: [
        event.title,
        lastContact
          ? ctx.locale === 'en'
            ? `Last contact: ${lastContact.summary}`
            : `Son temas: ${lastContact.summary}`
          : null,
        ...commitments.slice(0, 3).map((c) => `• ${c.text}`),
      ]
        .filter(Boolean)
        .join('\n'),
      travel: null,
      generatedAt: now,
      confidence: lastThread ? 0.6 : 0.4,
    };

    if (aiConfigured()) {
      try {
        const aiCtx = {
          userId: user.id,
          plan: plan.plan,
          timezone: ctx.timezone,
          locale: ctx.locale,
        };
        await checkAiBudget(aiCtx, 4000);
        const spec = meetingPrepPrompt({
          now,
          locale: ctx.locale,
          timezone: ctx.timezone,
          userName: ctx.firstName || ctx.displayName,
          event: {
            id: event.id,
            title: event.title,
            startAt: event.startAt,
            endAt: event.endAt,
            location: event.location ?? null,
            description: event.description ?? null,
            meetingUrl: event.meetingUrl ?? null,
            attendees: event.attendees.map((a) => ({
              name: a.name ?? null,
              email: a.email ?? null,
              isOrganizer: a.isOrganizer,
            })),
          },
          primaryPerson: primaryPerson
            ? {
                name: primaryPerson.displayName,
                company: primaryPerson.company ?? null,
                title: primaryPerson.title ?? null,
              }
            : personName
              ? { name: personName }
              : null,
          lastContact: lastThread
            ? {
                at: lastThread.lastMessageAt,
                summary: lastThread.analysis?.summary ?? lastThread.snippet,
                sourceId: lastThread.id,
              }
            : null,
          emails: related.map((t) => {
            const m = messages.find((x) => x.threadId === t.id);
            return {
              id: t.id,
              subject: t.subject,
              from: { name: m?.from.name ?? null, email: m?.from.email ?? null },
              sentAt: t.lastMessageAt,
              excerpt: m?.bodyText ?? t.snippet,
            };
          }),
          commitments: commitments.map((c) => ({
            id: c.id,
            text: c.text,
            direction: c.direction,
            dueText: c.dueText ?? null,
            counterpart: c.counterpartName ?? null,
          })),
          notes: notes.map((n) => ({ id: n.id, text: n.text, at: n.created_at })),
          files: files.map((f, i) => ({ id: `file-${i}`, name: f.name })),
        });
        const result = await createAi(aiCtx).generateStructured(meetingPrepAiSchema, spec, {
          userId: user.id,
          locale: ctx.locale,
          cacheKey: `prep:${user.id}:${event.id}:${event.updatedAt}:${related.length}`,
          cacheTtlSec: 12 * 3600,
        });
        const byId = new Map(related.map((t) => [t.id, t]));
        const ai = result.data;
        prep = {
          ...prep,
          purpose: ai.purpose,
          twoMinuteSummary: ai.twoMinuteSummary,
          talkingPoints: ai.talkingPoints.map((tp) => {
            const t = tp.sourceId ? byId.get(tp.sourceId) : undefined;
            return {
              title: tp.title,
              detail: tp.detail,
              source: t ? sourceForThread(t, sourceTypeOf(t), personName) : null,
            };
          }),
          relevantEmails: ai.relevantEmailIds
            .map((r) => byId.get(r.id))
            .filter((t): t is EmailThread => Boolean(t))
            .map((t) => ({
              thread: t,
              why: ai.relevantEmailIds.find((r) => r.id === t.id)?.why ?? '',
            }))
            .concat(
              prep.relevantEmails.filter(
                (r) => !ai.relevantEmailIds.some((x) => x.id === r.thread.id),
              ),
            )
            .slice(0, 5),
          openLoops: ai.openLoops.length
            ? ai.openLoops.map((o) => ({
                text: o.text,
                source: (o.sourceId && byId.get(o.sourceId)
                  ? sourceForThread(
                      byId.get(o.sourceId) as EmailThread,
                      sourceTypeOf(byId.get(o.sourceId) as EmailThread),
                      personName,
                    )
                  : commitments[0]?.source) ?? {
                  type: 'assistant',
                  id: event.id,
                  label: 'Asistan',
                  timestamp: now,
                },
              }))
            : prep.openLoops,
          confidence: ai.confidence,
        };
      } catch (e) {
        log.warn('meeting prep ai fallback', { error: e instanceof Error ? e.message : 'unknown' });
      }
    }

    const env = getEnv();
    const routes = createRoutesProvider({
      provider: env.routes.provider,
      apiKey: env.routes.googleApiKey ?? null,
    });
    const leave = await leaveByTime(event, routes, { origin: null, now });
    if (leave)
      prep.travel = {
        leaveAt: leave.leaveAt,
        durationMin: leave.durationMin,
        provider: leave.provider,
      };

    const { event: _event, ...persisted } = prep;
    await admin
      .from('calendar_events')
      .update({ prep: persisted, prep_generated_at: now })
      .eq('id', event.id)
      .eq('user_id', user.id);
    return json(prep);
  }),
);
