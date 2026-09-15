/** Cryptographically secure random values: tokens, PKCE, referral codes. */
import { bytesToBase64Url, bytesToHex } from './encoding';
import { sha256Base64Url } from './hash';

const MAX_RANDOM_CHUNK = 65_536;

export function randomBytes(length: number): Uint8Array {
  if (!Number.isInteger(length) || length < 0) throw new Error('Geçersiz uzunluk');
  const out = new Uint8Array(length);
  for (let offset = 0; offset < length; offset += MAX_RANDOM_CHUNK) {
    crypto.getRandomValues(out.subarray(offset, Math.min(length, offset + MAX_RANDOM_CHUNK)));
  }
  return out;
}

/** URL-safe token (base64url, no padding). 32 bytes → 43 chars. */
export function randomToken(byteLength = 32): string {
  return bytesToBase64Url(randomBytes(byteLength));
}

export function randomHex(byteLength = 16): string {
  return bytesToHex(randomBytes(byteLength));
}

export function randomUuid(): string {
  return crypto.randomUUID();
}

/** Uniform integer in [0, maxExclusive) using rejection sampling (no modulo bias). */
export function randomInt(maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 0x1_0000_0000) {
    throw new Error('Geçersiz aralık');
  }
  const limit = 0x1_0000_0000 - (0x1_0000_0000 % maxExclusive);
  const buffer = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buffer);
    const value = buffer[0] ?? 0;
    if (value < limit) return value % maxExclusive;
  }
}

/** Uniformly pick `length` characters from `alphabet`. */
export function randomString(length: number, alphabet: string): string {
  if (alphabet.length < 2) throw new Error('Alfabe çok kısa');
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet.charAt(randomInt(alphabet.length));
  return out;
}

// --- Referral codes ---------------------------------------------------------

/** 32 unambiguous characters: no 0/O, no 1/I/L-lookalikes beyond what is needed. */
export const REFERRAL_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const REFERRAL_CODE_LENGTH = 8;

/** 8 chars × 5 bits = 40 bits of entropy; brute force is also rate limited server-side. */
export function generateReferralCode(length = REFERRAL_CODE_LENGTH): string {
  if (!Number.isInteger(length) || length < 6 || length > 10)
    throw new Error('Geçersiz kod uzunluğu');
  return randomString(length, REFERRAL_CODE_ALPHABET);
}

/** Uppercase, drop spaces and dashes (users often type "abcd-efgh"). */
export function normalizeReferralCode(input: string): string {
  return input.replace(/[\s-]+/g, '').toLocaleUpperCase('en-US');
}

export function isValidReferralCodeFormat(code: string, length = REFERRAL_CODE_LENGTH): boolean {
  if (code.length !== length) return false;
  for (const ch of code) if (!REFERRAL_CODE_ALPHABET.includes(ch)) return false;
  return true;
}

// --- PKCE (RFC 7636) --------------------------------------------------------

export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

/** Random verifier of 43–128 unreserved characters (base64url of `byteLength` bytes). */
export function generatePkceVerifier(byteLength = 48): string {
  if (!Number.isInteger(byteLength) || byteLength < 32 || byteLength > 96) {
    throw new Error('PKCE verifier uzunluğu 32–96 bayt olmalı');
  }
  return randomToken(byteLength);
}

export function isValidPkceVerifier(verifier: string): boolean {
  return /^[A-Za-z0-9\-._~]{43,128}$/.test(verifier);
}

/** S256 challenge: base64url(sha256(verifier)) without padding. */
export async function pkceChallengeS256(verifier: string): Promise<string> {
  if (!isValidPkceVerifier(verifier)) throw new Error('Geçersiz PKCE verifier');
  return sha256Base64Url(verifier);
}

export async function createPkcePair(): Promise<PkcePair> {
  const codeVerifier = generatePkceVerifier();
  return {
    codeVerifier,
    codeChallenge: await pkceChallengeS256(codeVerifier),
    codeChallengeMethod: 'S256',
  };
}
