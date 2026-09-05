/**
 * Binary bodies for uploads (capture files, voice notes).
 *
 * - Web: `fetch(uri)` works for blob:/data:/http URIs and yields a Blob/ArrayBuffer.
 * - React Native: `fetch(uri).arrayBuffer()` is the path Supabase documents for Expo. When a local `file://`
 *   URI cannot be read that way we fall back to the native multipart part `{ uri, name, type }` that React
 *   Native's FormData understands. React Native's FormData has no `has()`/`get()` (storage-js calls `has()`),
 *   and its Blob cannot be built from an ArrayBuffer, so callers pick the right transport via `isNativePart`.
 */

export interface NativeFilePart {
  uri: string;
  name: string;
  type: string;
}

export type UploadBody = ArrayBuffer | Blob | NativeFilePart;

export interface FileInput {
  uri: string;
  mimeType: string;
  name: string;
}

export function isBlob(value: unknown): value is Blob {
  return typeof Blob !== 'undefined' && value instanceof Blob;
}

export function isNativePart(value: UploadBody): value is NativeFilePart {
  return !(value instanceof ArrayBuffer) && !isBlob(value);
}

export function isReactNative(): boolean {
  return typeof navigator !== 'undefined' && navigator.product === 'ReactNative';
}

/** Reads the file behind `uri` as bytes; falls back to the native part when the platform cannot read it. */
export async function loadFileBody(fetchFn: typeof fetch, input: FileInput): Promise<UploadBody> {
  try {
    const res = await fetchFn(input.uri);
    if (res.ok) {
      const bytes = await res.arrayBuffer();
      if (bytes.byteLength > 0) return bytes;
    }
  } catch {
    // Local file URIs are not readable via fetch on this platform — use the native part below.
  }
  return { uri: input.uri, name: input.name, type: input.mimeType };
}

/**
 * Body for a multipart `FormData` field. React Native sends `{ uri, name, type }` parts natively (its Blob cannot
 * wrap an ArrayBuffer); on web the bytes become a Blob.
 */
export async function loadMultipartBody(
  fetchFn: typeof fetch,
  input: FileInput,
): Promise<Blob | NativeFilePart> {
  if (isReactNative()) return { uri: input.uri, name: input.name, type: input.mimeType };
  const body = await loadFileBody(fetchFn, input);
  if (body instanceof ArrayBuffer) return new Blob([body], { type: input.mimeType });
  return body;
}

/** Appends a file body to a FormData for either platform. */
export function appendFilePart(
  form: FormData,
  field: string,
  body: Blob | NativeFilePart,
  fileName: string,
): void {
  if (isBlob(body)) {
    form.append(field, body, fileName);
    return;
  }
  // React Native's FormData accepts `{ uri, name, type }` parts; the DOM typings only know Blob.
  form.append(field, body as unknown as Blob);
}

/** File name that is safe inside a storage object path (ASCII letters, digits, `.`, `_`, `-`). */
export function safeFileName(fileName: string, fallbackExt: string): string {
  const trimmed = fileName
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[_.]+|[_.]+$/g, '');
  const base = trimmed.length > 0 ? trimmed.slice(-120) : `file${fallbackExt}`;
  return base.includes('.') ? base : `${base}${fallbackExt}`;
}

/** Best-effort file extension for a MIME type (used when the caller gives no file name). */
export function extensionForMime(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/heic': '.heic',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
    'text/plain': '.txt',
    'audio/m4a': '.m4a',
    'audio/mp4': '.m4a',
    'audio/x-m4a': '.m4a',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/webm': '.webm',
  };
  return map[mimeType.toLowerCase()] ?? '.bin';
}
