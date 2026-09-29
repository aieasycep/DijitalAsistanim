/**
 * Share-extension / Android share-intent → Universal Capture mapping.
 * Pure helpers plus a process-level "pending capture" hand-off consumed by the `/capture` screen.
 * Files are referenced by URI only — nothing is read or uploaded here.
 */
import type { CaptureKind } from '@da/domain';
import type { ShareIntent, ShareIntentFile } from 'expo-share-intent';

/** iOS share extensions run with a ~120 MB memory cap; the product limit for a single capture is 25 MB. */
export const MAX_SHARE_FILE_BYTES = 25 * 1024 * 1024;

export interface ShareCaptureFile {
  uri: string;
  mimeType: string;
  fileName: string;
  sizeBytes: number | null;
}

export type ShareCaptureRejection = 'tooLarge' | 'unsupported';

export interface ShareCaptureItem {
  kind: CaptureKind;
  text?: string;
  url?: string;
  /** Page title (web share) or file name. */
  title?: string;
  file?: ShareCaptureFile;
  /** Set when the item cannot be captured; the capture screen shows the matching `capture.*` message. */
  rejected?: ShareCaptureRejection;
}

export interface PendingShareCapture {
  items: ShareCaptureItem[];
  receivedAt: string;
  /** Stable fingerprint of the native payload, used to ignore duplicate deliveries. */
  signature: string;
}

const URL_RE = /https?:\/\/[^\s<>"']+/i;

/** Maps a MIME type to a capture kind, or `null` when the product does not analyze that type. */
export function captureKindForMime(mimeType: string | null | undefined): CaptureKind | null {
  const mime = (mimeType ?? '').toLowerCase().trim();
  if (!mime) return 'file';
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return null;
  return 'file';
}

function mapFile(file: ShareIntentFile): ShareCaptureItem {
  const kind = captureKindForMime(file.mimeType);
  const size = typeof file.size === 'number' && Number.isFinite(file.size) ? file.size : null;
  const item: ShareCaptureItem = {
    kind: kind ?? 'file',
    title: file.fileName,
    file: { uri: file.path, mimeType: file.mimeType, fileName: file.fileName, sizeBytes: size },
  };
  if (!kind) item.rejected = 'unsupported';
  else if (size !== null && size > MAX_SHARE_FILE_BYTES) item.rejected = 'tooLarge';
  return item;
}

/**
 * Turns a native share intent into capture items. Order: primary item first (link > text > files),
 * additional files queued after it so the capture screen can process them one by one.
 */
export function mapShareIntentToCapture(
  intent: ShareIntent | null | undefined,
): ShareCaptureItem[] {
  if (!intent) return [];
  const items: ShareCaptureItem[] = [];
  const text = intent.text?.trim() ?? '';
  const webUrl = intent.webUrl?.trim() || (text ? (URL_RE.exec(text)?.[0] ?? '') : '');
  const title = intent.meta?.title?.trim() || undefined;

  if (webUrl) {
    const item: ShareCaptureItem = { kind: 'link', url: webUrl };
    if (title) item.title = title;
    if (text && text !== webUrl) item.text = text;
    items.push(item);
  } else if (text) {
    const item: ShareCaptureItem = { kind: 'text', text };
    if (title) item.title = title;
    items.push(item);
  }

  for (const file of intent.files ?? []) {
    if (!file?.path) continue;
    items.push(mapFile(file));
  }
  return items;
}

/** Fingerprint used to ignore the same payload being delivered twice (URL change + app-state refresh). */
export function shareIntentSignature(intent: ShareIntent | null | undefined): string {
  if (!intent) return '';
  const files = (intent.files ?? []).map((f) => `${f.path}:${f.size ?? ''}`).join(',');
  return [intent.type ?? '', intent.webUrl ?? '', intent.text ?? '', files].join('|');
}

let pending: PendingShareCapture | null = null;

export function setPendingShareCapture(
  items: ShareCaptureItem[],
  signature: string,
  receivedAt = new Date(),
): PendingShareCapture | null {
  if (!items.length) return null;
  pending = { items, signature, receivedAt: receivedAt.toISOString() };
  return pending;
}

/** Returns the pending share capture without clearing it (used to decide whether to navigate). */
export function peekPendingShareCapture(): PendingShareCapture | null {
  return pending;
}

/** Returns and clears the pending share capture — called exactly once by the capture screen. */
export function consumePendingShareCapture(): PendingShareCapture | null {
  const current = pending;
  pending = null;
  return current;
}

export function clearPendingShareCapture(): void {
  pending = null;
}
