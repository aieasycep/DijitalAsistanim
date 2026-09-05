/** GET /person?contactId — Person Intelligence: last contact, upcoming meetings, open loops, topics, commitments, related mail. */
import { z } from 'zod';
import { AppError } from '@da/server-core/errors';
import type {
  CalendarEvent,
  Commitment,
  Contact,
  EmailThread,
  PersonIntelligence,
  SourceRef,
} from '@da/domain';
import { assertMethod, handler, json, parseInput, requireUser, uuidParam } from '../_shared/mod.ts';
import { camelize } from '../_shared/rows.ts';

const schema = z.object({ contactId: uuidParam });

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'GET');
    const { user, db } = await requireUser(req);
    const { contactId } = await parseInput(req, schema);

    const { data: contactRow, error } = await db
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error || !contactRow) throw new AppError('not_found', 'Kişi bulunamadı.');
    const contact = camelize<Contact>(contactRow);
    const emails = contact.emails.map((e) => e.toLowerCase());
    const now = new Date().toISOString();

    // Threads where the person participates (jsonb participants contains email)
    const threadQueries = emails
      .slice(0, 5)
      .map((email) =>
        db
          .from('email_threads')
          .select('*')
          .eq('user_id', user.id)
          .is('deleted_at', null)
          .contains('participants', [{ email }])
          .order('last_message_at', { ascending: false })
          .limit(20),
      );
    const [
      threadResults,
      { data: events },
      { data: commitments },
      { data: followUps },
      { data: memory },
    ] = await Promise.all([
      Promise.all(threadQueries),
      db
        .from('calendar_events')
        .select('*')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .neq('status', 'cancelled')
        .gte('start_at', now)
        .order('start_at', { ascending: true })
        .limit(50),
      db
        .from('commitments')
        .select('*')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .eq('counterpart_contact_id', contactId)
        .order('due_at', { ascending: true, nullsFirst: false })
        .limit(50),
      db
        .from('follow_ups')
        .select('id, status')
        .eq('user_id', user.id)
        .eq('contact_id', contactId)
        .in('status', ['watching', 'nudge_due', 'snoozed']),
      db
        .from('memory_chunks')
        .select('topic, occurred_at, source')
        .eq('user_id', user.id)
        .eq('contact_id', contactId)
        .order('occurred_at', { ascending: false })
        .limit(8),
    ]);

    const seen = new Set<string>();
    const threads: EmailThread[] = [];
    for (const r of threadResults) {
      for (const row of camelize<EmailThread[]>(r.data ?? [])) {
        if (!seen.has(row.id)) {
          seen.add(row.id);
          threads.push(row);
        }
      }
    }
    threads.sort((a, b) => Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt));

    const upcomingMeetings = camelize<CalendarEvent[]>(events ?? []).filter((e) =>
      e.attendees.some(
        (a) => (a.email && emails.includes(a.email.toLowerCase())) || a.contactId === contactId,
      ),
    );
    const allCommitments = camelize<Commitment[]>(commitments ?? []);
    const open = allCommitments.filter(
      (c) => c.status === 'open' || c.status === 'proposed' || c.status === 'postponed',
    );
    const openLoops = open.length + ((followUps ?? []) as unknown[]).length;

    const last = threads[0];
    const lastContact = last
      ? {
          at: last.lastMessageAt,
          channel: 'gmail' as const,
          summary: last.analysis?.summary ?? last.snippet,
          source: {
            type: 'gmail',
            id: last.id,
            label: 'Gmail',
            person: contact.displayName,
            timestamp: last.lastMessageAt,
          } satisfies SourceRef,
        }
      : null;

    const recentTopics = (
      (memory ?? []) as { topic: string | null; occurred_at: string; source: SourceRef }[]
    )
      .filter((m) => m.topic)
      .map((m) => ({ topic: m.topic as string, at: m.occurred_at, source: m.source }));

    const response: PersonIntelligence = {
      contact,
      lastContact,
      upcomingMeetings,
      openLoops,
      recentTopics,
      userOwes: open.filter((c) => c.direction === 'user_owes'),
      theyOwe: open.filter((c) => c.direction === 'other_owes'),
      relatedMessages: threads.slice(0, 10),
      relatedCommitments: allCommitments,
    };
    return json(response);
  }),
);
