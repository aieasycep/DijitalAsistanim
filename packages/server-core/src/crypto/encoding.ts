/**
 * Byte / string encoding helpers built only on Web APIs (btoa, atob, TextEncoder, TextDecoder)
 * so the same code runs in Deno Edge Functions and Node.
 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function utf8Encode(text: string): Uint8Array {
  return textEncoder.encode(text);
}

export function utf8Decode(bytes: Uint8Array): string {
  return textDecoder.decode(bytes);
}

/** Copy a byte view into a standalone ArrayBuffer (what `crypto.subtle` expects). */
export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const compact = base64.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(compact) || compact.length % 4 === 1) {
    throw new Error('Geçersiz base64 verisi');
  }
  let binary: string;
  try {
    binary = atob(compact);
  } catch (cause) {
    throw new Error('Geçersiz base64 verisi', { cause });
  }
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(base64url: string): Uint8Array {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const remainder = base64.length % 4;
  if (remainder === 2) base64 += '==';
  else if (remainder === 3) base64 += '=';
  else if (remainder === 1) throw new Error('Geçersiz base64url verisi');
  return base64ToBytes(base64);
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
    throw new Error('Geçersiz hex verisi');
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Accept either text (UTF-8 encoded) or raw bytes. */
export function toBytes(input: string | Uint8Array): Uint8Array {
  return typeof input === 'string' ? utf8Encode(input) : input;
}
