/** SHA-256 / HMAC-SHA256 helpers over WebCrypto plus constant-time comparison. */
import { normalizeText } from '../util';
import { bytesToBase64Url, bytesToHex, toArrayBuffer, toBytes } from './encoding';

export async function sha256Bytes(input: string | Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(toBytes(input)));
  return new Uint8Array(digest);
}

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  return bytesToHex(await sha256Bytes(input));
}

export async function sha256Base64Url(input: string | Uint8Array): Promise<string> {
  return bytesToBase64Url(await sha256Bytes(input));
}

async function importHmacKey(secret: string | Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    toArrayBuffer(toBytes(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function hmacSha256(
  secret: string | Uint8Array,
  message: string | Uint8Array,
): Promise<Uint8Array> {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, toArrayBuffer(toBytes(message)));
  return new Uint8Array(signature);
}

export async function hmacSha256Hex(
  secret: string | Uint8Array,
  message: string | Uint8Array,
): Promise<string> {
  return bytesToHex(await hmacSha256(secret, message));
}

export async function hmacSha256Base64Url(
  secret: string | Uint8Array,
  message: string | Uint8Array,
): Promise<string> {
  return bytesToBase64Url(await hmacSha256(secret, message));
}

/**
 * Constant-time string comparison. Runtime does not depend on where the first difference is;
 * only the (public) lengths leak.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i++) {
    diff |= (a.charCodeAt(i) | 0) ^ (b.charCodeAt(i) | 0);
  }
  return diff === 0;
}

export function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/** Verify a hex HMAC-SHA256 signature (webhooks, signed tokens). */
export async function verifyHmacSha256Hex(
  secret: string | Uint8Array,
  message: string | Uint8Array,
  signatureHex: string,
): Promise<boolean> {
  const expected = await hmacSha256Hex(secret, message);
  return timingSafeEqual(expected, signatureHex.trim().toLowerCase());
}

/**
 * Content fingerprint: SHA-256 hex of the normalized text (HTML stripped, whitespace collapsed).
 * Identical content therefore never reaches the AI pipeline twice.
 */
export async function fingerprint(text: string): Promise<string> {
  return sha256Hex(normalizeText(text));
}
