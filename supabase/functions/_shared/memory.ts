/**
 * Memory persistence: turn an entity into normalized chunks (server-core/memory), embed them when an
 * embedding provider is configured, and upsert into memory_chunks (one row per user/source/entity).
 */
import {
  buildMemoryChunks,
  type BuildMemoryChunksInput,
  type MemoryChunkDraft,
} from '@da/server-core/memory';
import { prepareEmbeddingText, toPgVectorLiteral } from '@da/server-core/embeddings';
import { createEmbeddings } from './ai.ts';
import type { Db } from './db.ts';
import { log } from './log.ts';

export function upsertMemory(
  admin: Db,
  userId: string,
  input: BuildMemoryChunksInput,
): Promise<number> {
  const drafts = buildMemoryChunks(input);
  if (drafts.length === 0) return Promise.resolve(0);
  return persistChunks(admin, userId, drafts);
}

export async function persistChunks(
  admin: Db,
  userId: string,
  drafts: readonly MemoryChunkDraft[],
): Promise<number> {
  const embeddings = createEmbeddings();
  let vectors: (number[] | null)[] = drafts.map(() => null);
  if (embeddings) {
    try {
      const texts = drafts.map((d) => prepareEmbeddingText(`${d.topic ?? ''}\n${d.content}`));
      const out = await embeddings.embed(texts);
      vectors = drafts.map((_, i) => out[i] ?? null);
    } catch (e) {
      log.warn('embedding failed; storing chunks for fts only', {
        error: e instanceof Error ? e.message : 'unknown',
      });
    }
  }
  const rows = drafts.map((d, i) => {
    const vec = vectors[i];
    return {
      user_id: userId,
      source_type: d.sourceType,
      source_id: d.sourceId,
      source: d.source,
      content: d.content,
      topic: d.topic ?? null,
      person_name: d.personName ?? null,
      contact_id: d.contactId ?? null,
      occurred_at: d.occurredAt,
      token_count: d.tokenCount,
      expires_at: d.expiresAt ?? null,
      ...(vec ? { embedding: toPgVectorLiteral(vec) } : {}),
    };
  });
  const { error } = await admin
    .from('memory_chunks')
    .upsert(rows, { onConflict: 'user_id,source_type,source_id' });
  if (error) {
    log.warn('memory upsert failed', { error: error.message });
    return 0;
  }
  return rows.length;
}
