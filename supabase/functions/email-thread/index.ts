/** GET /email-thread?id — thread with messages (bodies from our retention-limited store), related insight, follow-up, commitments. */
import { z } from 'zod';
import { AppError } from '@da/server-core/errors';
import type { Commitment, EmailDetailResponse, EmailThread, FollowUp, Insight } from '@da/domain';
import { assertMethod, handler, json, parseInput, requireUser, uuidParam } from '../_shared/mod.ts';
import { camelize } from '../_shared/rows.ts';

const schema = z.object({ id: uuidParam });

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'GET');
    const { user, db } = await requireUser(req);
    const { id } = await parseInput(req, schema);

    const { data: threadRow, error } = await db.from('email_threads').select('*').eq('id', id).eq('user_id', user.id).maybeSingle();
    if (error || !threadRow) throw new AppError('not_found', 'Bu mail bulunamadı.');
    const thread = camelize<EmailThread>(threadRow);

    const [{ data: messages }, { data: insight }, { data: followUp }, { data: commitments }] = await Promise.all([
      db.from('email_messages').select('id, from_participant, sent_at, body_text, snippet, is_from_user, web_url').eq('thread_id', id).is('deleted_at', null).order('sent_at', { ascending: true }),
      db.from('insights').select('*').eq('user_id', user.id).eq('entity_type', 'email_thread').eq('entity_id', id).is('deleted_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      db.from('follow_ups').select('*').eq('user_id', user.id).eq('thread_id', id).maybeSingle(),
      db.from('commitments').select('*').eq('user_id', user.id).is('deleted_at', null).contains('source', { id }).order('created_at', { ascending: false }).limit(10),
    ]);

    const response: EmailDetailResponse = {
      thread,
      messages: ((messages ?? []) as Array<{ id: string; from_participant: { name?: string | null; email: string }; sent_at: string; body_text: string | null; snippet: string; is_from_user: boolean; web_url: string | null }>).map((m) => ({
        id: m.id,
        from: m.from_participant.name ? `${m.from_participant.name} <${m.from_participant.email}>` : m.from_participant.email,
        sentAt: m.sent_at,
        bodyText: m.body_text ?? m.snippet,
        isFromUser: m.is_from_user,
        webUrl: m.web_url,
      })),
      relatedInsight: insight ? camelize<Insight>(insight) : null,
      followUp: followUp ? camelize<FollowUp>(followUp) : null,
      commitments: camelize<Commitment[]>(commitments ?? []),
    };
    if (!thread.isRead) {
      await db.from('email_threads').update({ is_read: true }).eq('id', id);
    }
    return json(response);
  }),
);
