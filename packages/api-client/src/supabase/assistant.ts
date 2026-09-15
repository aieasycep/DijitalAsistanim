/** AssistantApi + SearchApi: assistant functions, assistant_threads/messages, server STT, search + recent queries. */
import type { AssistantApi, SearchApi } from '../datasource';
import { exec, read, write, type SupabaseContext } from './client';
import { appendFilePart, extensionForMime, loadMultipartBody } from './files';
import { AI_TIMEOUT_MS } from './functions';
import { RECENT_SEARCHES_KEY } from './localState';
import { toAssistantMessage, toAssistantThread } from './mappers';
import type { AssistantMessageRow, AssistantThreadRow } from './rows';

const MAX_RECENT_QUERIES = 8;

export function createAssistantApi(ctx: SupabaseContext): AssistantApi {
  const threads = () => ctx.table<AssistantThreadRow>('assistant_threads');
  const messages = () => ctx.table<AssistantMessageRow>('assistant_messages');

  return {
    ask: (req) => ctx.call('assistant-ask', req),

    suggestedQuestions: (input) =>
      ctx.call('assistant-suggested-questions', { contactId: input?.contactId ?? null }),

    listThreads: () =>
      read(async () => {
        const userId = await ctx.requireUserId();
        const rows = await exec(
          threads()
            .select('*')
            .eq('user_id', userId)
            .is('deleted_at', null)
            .order('last_message_at', { ascending: false }),
        );
        return rows.map(toAssistantThread);
      }),

    getThreadMessages: (threadId) =>
      read(async () => {
        const userId = await ctx.requireUserId();
        const rows = await exec(
          messages()
            .select('*')
            .eq('user_id', userId)
            .eq('thread_id', threadId)
            .order('created_at', { ascending: true }),
        );
        return rows.map(toAssistantMessage);
      }),

    deleteThread: (threadId) =>
      write(async () => {
        const userId = await ctx.requireUserId();
        await exec(
          threads()
            .update({ deleted_at: ctx.now().toISOString() })
            .eq('user_id', userId)
            .eq('id', threadId)
            .is('deleted_at', null),
        );
      }),

    /** Multipart upload of the recording; the server answers `{ provider: 'device' }` when no STT provider is configured. */
    transcribe: async (input) => {
      const name = `voice${extensionForMime(input.mimeType)}`;
      const form = new FormData();
      appendFilePart(
        form,
        'file',
        await loadMultipartBody(ctx.fetch, { uri: input.uri, mimeType: input.mimeType, name }),
        name,
      );
      form.append('durationSec', String(input.durationSec));
      form.append('mimeType', input.mimeType);
      const result = await ctx.call('assistant-transcribe', form, { timeoutMs: AI_TIMEOUT_MS });
      if (result.provider === 'device') return null;
      return { text: result.text };
    },
  };
}

export function createSearchApi(ctx: SupabaseContext): SearchApi {
  async function readRecent(): Promise<string[]> {
    const raw = await ctx.storage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((q): q is string => typeof q === 'string') : [];
    } catch {
      return [];
    }
  }

  return {
    search: (req) => ctx.call('search', req),

    recentQueries: () => readRecent(),

    rememberQuery: async (q) => {
      const trimmed = q.trim();
      if (!trimmed) return;
      const key = trimmed.toLocaleLowerCase('tr');
      const current = await readRecent();
      const next = [
        trimmed,
        ...current.filter((item) => item.toLocaleLowerCase('tr') !== key),
      ].slice(0, MAX_RECENT_QUERIES);
      await ctx.storage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
    },
  };
}
