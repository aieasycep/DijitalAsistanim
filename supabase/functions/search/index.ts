/**
 * GET /search?query&limit&kinds — Memory search over emails, events, people, life events, promises and
 * captured notes. Semantic (pgvector) when an embedding provider is configured, Turkish full-text
 * otherwise — the app never notices the difference except via `mode`.
 */
import type {
  CalendarEvent,
  Commitment,
  Contact,
  EmailThread,
  LifeEvent,
  MemoryChunk,
  SearchResponse,
  TaskItem,
} from '@da/domain';
import { searchRequestSchema } from '@da/validation';
import { toPgVectorLiteral } from '@da/server-core/embeddings';
import { AppError } from '@da/server-core/errors';
import { buildFtsQuery, toSearchResults } from '@da/server-core/memory';
import { createEmbeddings } from '../_shared/ai.ts';
import { loadUserContext } from '../_shared/context.ts';
import {
  assertMethod,
  enforceRateLimit,
  handler,
  json,
  parseInput,
  requireUser,
} from '../_shared/mod.ts';
import { log } from '../_shared/log.ts';
import { camelize } from '../_shared/rows.ts';

type SearchMode = 'semantic' | 'fts';

Deno.serve(
  handler(async (req) => {
    assertMethod(req, 'GET');
    const { user, db } = await requireUser(req);
    const input = await parseInput(req, searchRequestSchema);
    await enforceRateLimit('search', user.id);
    const ctx = await loadUserContext(db, user.id);
    const query = input.query.trim();
    const like = `%${query.replace(/[%_]/g, (m) => `\\${m}`)}%`;

    let mode: SearchMode = 'fts';
    let queryEmbedding: string | null = null;
    const embeddings = createEmbeddings();
    if (embeddings) {
      try {
        const [vec] = await embeddings.embed([query]);
        if (vec) {
          queryEmbedding = toPgVectorLiteral(vec);
          mode = 'semantic';
        }
      } catch (e) {
        log.warn('query embedding failed; using fts', {
          error: e instanceof Error ? e.message : 'unknown',
        });
      }
    }

    const wants = (kind: NonNullable<typeof input.kinds>[number]) =>
      !input.kinds || input.kinds.includes(kind);
    const [
      { data: chunks, error: chunkErr },
      { data: threads },
      { data: events },
      { data: contacts },
      { data: lifeEvents },
      { data: commitments },
      { data: tasks },
    ] = await Promise.all([
      wants('memory') || wants('email')
        ? db.rpc('search_memory', {
            query,
            match_count: Math.min(50, input.limit * 2),
            query_embedding: queryEmbedding,
            contact: null,
          })
        : Promise.resolve({ data: [], error: null }),
      wants('email')
        ? db
            .from('email_threads')
            .select('*')
            .eq('user_id', user.id)
            .is('deleted_at', null)
            .or(`subject.ilike.${like},snippet.ilike.${like}`)
            .order('last_message_at', { ascending: false })
            .limit(input.limit)
        : Promise.resolve({ data: [] }),
      wants('event')
        ? db
            .from('calendar_events')
            .select('*')
            .eq('user_id', user.id)
            .is('deleted_at', null)
            .or(`title.ilike.${like},location.ilike.${like},description.ilike.${like}`)
            .order('start_at', { ascending: false })
            .limit(input.limit)
        : Promise.resolve({ data: [] }),
      wants('person')
        ? db
            .from('contacts')
            .select('*')
            .eq('user_id', user.id)
            .is('deleted_at', null)
            .or(`display_name.ilike.${like},company.ilike.${like}`)
            .limit(input.limit)
        : Promise.resolve({ data: [] }),
      wants('life_event')
        ? db
            .from('life_events')
            .select('*')
            .eq('user_id', user.id)
            .is('deleted_at', null)
            .ilike('title', like)
            .limit(input.limit)
        : Promise.resolve({ data: [] }),
      wants('commitment')
        ? db
            .from('commitments')
            .select('*')
            .eq('user_id', user.id)
            .is('deleted_at', null)
            .or(`text.ilike.${like},counterpart_name.ilike.${like}`)
            .limit(input.limit)
        : Promise.resolve({ data: [] }),
      wants('task')
        ? db
            .from('tasks')
            .select('*')
            .eq('user_id', user.id)
            .is('deleted_at', null)
            .ilike('title', like)
            .limit(input.limit)
        : Promise.resolve({ data: [] }),
    ]);
    if (chunkErr) throw new AppError('internal', `Arama başarısız: ${chunkErr.message}`);

    const chunkRows = (
      (chunks ?? []) as {
        id: string;
        source_type: MemoryChunk['sourceType'];
        source_id: string;
        source: MemoryChunk['source'];
        content: string;
        topic: string | null;
        person_name: string | null;
        occurred_at: string;
        score: number;
        mode: string;
      }[]
    ).map((c) => ({
      id: c.id,
      userId: user.id,
      sourceType: c.source_type,
      sourceId: c.source_id,
      source: c.source,
      content: c.content,
      topic: c.topic,
      personName: c.person_name,
      contactId: null,
      occurredAt: c.occurred_at,
      tokenCount: 0,
      hasEmbedding: c.mode === 'semantic',
      expiresAt: null,
      createdAt: c.occurred_at,
      updatedAt: c.occurred_at,
      score: c.score,
    }));
    const results = toSearchResults(
      {
        chunks: chunkRows,
        threads: camelize<EmailThread[]>(threads ?? []),
        events: camelize<CalendarEvent[]>(events ?? []),
        contacts: camelize<Contact[]>(contacts ?? []),
        lifeEvents: camelize<LifeEvent[]>(lifeEvents ?? []),
        commitments: camelize<Commitment[]>(commitments ?? []),
        tasks: camelize<TaskItem[]>(tasks ?? []),
      },
      {
        mode,
        query: mode === 'fts' ? buildFtsQuery(query) : query,
        now: new Date().toISOString(),
        locale: ctx.locale,
        timezone: ctx.timezone,
        limit: input.limit,
      },
    );
    const response: SearchResponse = { results, mode };
    return json(response);
  }),
);
