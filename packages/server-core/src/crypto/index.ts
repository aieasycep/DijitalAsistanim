/**
 * crypto — WebCrypto-only primitives shared by edge functions:
 * AES-256-GCM at-rest encryption with key rotation, hashing/HMAC, secure random tokens,
 * PKCE, referral codes and stable idempotency keys.
 */
export {
  base64ToBytes,
  base64UrlToBytes,
  bytesToBase64,
  bytesToBase64Url,
  bytesToHex,
  hexToBytes,
  toArrayBuffer,
  toBytes,
  utf8Decode,
  utf8Encode,
} from './encoding';
export {
  ENCRYPTION_FORMAT_VERSION,
  createTokenCipher,
  decryptString,
  decryptStringDetailed,
  encryptString,
  importEncryptionKey,
  isEncryptedPayload,
  needsReencrypt,
  parseEncryptedPayload,
} from './aes';
export type {
  DecryptFailureReason,
  DecryptResult,
  EncryptOptions,
  EncryptedPayload,
  EncryptionKeyring,
  ReencryptResult,
  TokenCipher,
} from './aes';
export {
  fingerprint,
  hmacSha256,
  hmacSha256Base64Url,
  hmacSha256Hex,
  sha256Base64Url,
  sha256Bytes,
  sha256Hex,
  timingSafeEqual,
  timingSafeEqualBytes,
  verifyHmacSha256Hex,
} from './hash';
export {
  REFERRAL_CODE_ALPHABET,
  REFERRAL_CODE_LENGTH,
  createPkcePair,
  generatePkceVerifier,
  generateReferralCode,
  isValidPkceVerifier,
  isValidReferralCodeFormat,
  normalizeReferralCode,
  pkceChallengeS256,
  randomBytes,
  randomHex,
  randomInt,
  randomString,
  randomToken,
  randomUuid,
} from './random';
export type { PkcePair } from './random';
export { buildIdempotencyKey, canonicalJson } from './idempotency';
