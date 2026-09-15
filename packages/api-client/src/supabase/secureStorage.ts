/**
 * Session storage adapter for supabase-js backed by the app's secure key-value store (Expo SecureStore on
 * device). iOS SecureStore rejects values larger than 2048 bytes, and a Supabase session (JWT + refresh token +
 * user) is usually bigger, so values are transparently split across `key.0`, `key.1`, … with a small manifest
 * stored under the original key. Readers of the plain key never see partial data: chunks are written before the
 * manifest and removed after it.
 */
import type { KeyValueStorage } from '../config';

/** Per-value size limit enforced by iOS SecureStore (bytes, UTF-8). */
export const SECURE_STORE_MAX_BYTES = 2048;

const MANIFEST_PREFIX = '__da_chunks__:';

/** Shape supabase-js expects for `auth.storage` (a Promise-returning subset of Web Storage). */
export interface SessionStorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export function createChunkedSecureStorage(
  store: KeyValueStorage,
  maxBytes: number = SECURE_STORE_MAX_BYTES,
): SessionStorageAdapter {
  const chunkKey = (key: string, index: number): string => `${key}.${index}`;

  async function readChunkCount(key: string): Promise<{ head: string | null; chunks: number }> {
    const head = await store.getItem(key);
    if (head === null || !head.startsWith(MANIFEST_PREFIX)) return { head, chunks: 0 };
    const count = Number.parseInt(head.slice(MANIFEST_PREFIX.length), 10);
    return { head, chunks: Number.isFinite(count) && count > 0 ? count : 0 };
  }

  async function removeChunks(key: string, from: number, to: number): Promise<void> {
    const removals: Promise<void>[] = [];
    for (let i = from; i < to; i++) removals.push(store.removeItem(chunkKey(key, i)));
    await Promise.all(removals);
  }

  return {
    async getItem(key) {
      const { head, chunks } = await readChunkCount(key);
      if (head === null) return null;
      if (chunks === 0) return head.startsWith(MANIFEST_PREFIX) ? null : head;
      const parts = await Promise.all(
        Array.from({ length: chunks }, (_, i) => store.getItem(chunkKey(key, i))),
      );
      if (parts.some((p) => p === null)) return null;
      return parts.join('');
    },

    async setItem(key, value) {
      const { chunks: previous } = await readChunkCount(key);
      if (utf8ByteLength(value) <= maxBytes) {
        await store.setItem(key, value);
        await removeChunks(key, 0, previous);
        return;
      }
      const chunks = splitByUtf8Bytes(value, maxBytes);
      await Promise.all(chunks.map((chunk, i) => store.setItem(chunkKey(key, i), chunk)));
      await store.setItem(key, `${MANIFEST_PREFIX}${chunks.length}`);
      await removeChunks(key, chunks.length, previous);
    },

    async removeItem(key) {
      const { chunks } = await readChunkCount(key);
      await store.removeItem(key);
      await removeChunks(key, 0, chunks);
    },
  };
}

/** UTF-8 encoded length without relying on TextEncoder (not available on every JS engine we ship to). */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/** Splits on code-point boundaries so every chunk stays at or below `maxBytes` when UTF-8 encoded. */
export function splitByUtf8Bytes(text: string, maxBytes: number): string[] {
  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;
  for (const ch of text) {
    const size = utf8ByteLength(ch);
    if (currentBytes + size > maxBytes && current) {
      chunks.push(current);
      current = '';
      currentBytes = 0;
    }
    current += ch;
    currentBytes += size;
  }
  if (current) chunks.push(current);
  return chunks;
}
