/**
 * AES-256-GCM string encryption for secrets at rest (OAuth refresh tokens etc.).
 *
 * Payload format: `v1:<base64 iv (12 bytes)>:<base64 ciphertext+tag>`
 * Keys are 32 random bytes, base64 encoded (`openssl rand -base64 32`).
 *
 * Key rotation: decrypt with the current key first, then the previous key. When the previous
 * key was needed the caller should re-encrypt (`needsReencrypt` / `reencryptIfNeeded`).
 */
import { AppError } from '../errors';
import { base64ToBytes, bytesToBase64, toArrayBuffer, utf8Decode, utf8Encode } from './encoding';

export const ENCRYPTION_FORMAT_VERSION = 'v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BITS = 128;

export interface EncryptionKeyring {
  /** Base64 encoded 32-byte key used for all new encryptions. */
  current: string;
  /** Previous key kept only until every stored secret has been re-encrypted. */
  previous?: string | null;
}

export interface EncryptOptions {
  /** Additional authenticated data (e.g. the owning user id) bound to the ciphertext. */
  aad?: string;
}

export interface DecryptResult {
  plaintext: string;
  keyUsed: 'current' | 'previous';
  /** True when the previous key was needed — persist a fresh encryption with the current key. */
  needsReencrypt: boolean;
}

export interface EncryptedPayload {
  version: typeof ENCRYPTION_FORMAT_VERSION;
  iv: Uint8Array;
  data: Uint8Array;
}

export type DecryptFailureReason = 'bad_format' | 'unsupported_version' | 'decrypt_failed';

function cryptoError(reason: DecryptFailureReason | 'bad_key', cause?: unknown): AppError {
  const message =
    reason === 'bad_key' ? 'Şifreleme anahtarı geçersiz.' : 'Şifreli veri çözülemedi.';
  return new AppError('internal', message, { details: { reason }, cause });
}

function decodeKeyBytes(base64Key: string): Uint8Array {
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(base64Key.trim());
  } catch (cause) {
    throw cryptoError('bad_key', cause);
  }
  if (bytes.length !== KEY_BYTES) throw cryptoError('bad_key');
  return bytes;
}

/** Import a base64 32-byte key as a non-extractable AES-GCM CryptoKey. */
export async function importEncryptionKey(base64Key: string): Promise<CryptoKey> {
  const raw = decodeKeyBytes(base64Key);
  return crypto.subtle.importKey('raw', toArrayBuffer(raw), { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

async function resolveKey(key: string | CryptoKey): Promise<CryptoKey> {
  return typeof key === 'string' ? importEncryptionKey(key) : key;
}

function aadBuffer(aad: string | undefined): ArrayBuffer | undefined {
  return aad === undefined ? undefined : toArrayBuffer(utf8Encode(aad));
}

export async function encryptString(
  plaintext: string,
  key: string | CryptoKey,
  opts: EncryptOptions = {},
): Promise<string> {
  const cryptoKey = await resolveKey(key);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const additionalData = aadBuffer(opts.aad);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: TAG_BITS, ...(additionalData ? { additionalData } : {}) },
    cryptoKey,
    toArrayBuffer(utf8Encode(plaintext)),
  );
  return `${ENCRYPTION_FORMAT_VERSION}:${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(encrypted))}`;
}

export function isEncryptedPayload(value: string): boolean {
  const parts = value.split(':');
  return parts.length === 3 && parts[0] === ENCRYPTION_FORMAT_VERSION;
}

export function parseEncryptedPayload(payload: string): EncryptedPayload {
  const parts = payload.split(':');
  if (parts.length !== 3) throw cryptoError('bad_format');
  const [version, ivB64, dataB64] = parts as [string, string, string];
  if (version !== ENCRYPTION_FORMAT_VERSION) throw cryptoError('unsupported_version');
  let iv: Uint8Array;
  let data: Uint8Array;
  try {
    iv = base64ToBytes(ivB64);
    data = base64ToBytes(dataB64);
  } catch (cause) {
    throw cryptoError('bad_format', cause);
  }
  if (iv.length !== IV_BYTES || data.length < TAG_BITS / 8) throw cryptoError('bad_format');
  return { version: ENCRYPTION_FORMAT_VERSION, iv, data };
}

async function decryptWithKey(
  parsed: EncryptedPayload,
  key: CryptoKey,
  aad: string | undefined,
): Promise<string> {
  const additionalData = aadBuffer(aad);
  const plain = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(parsed.iv),
      tagLength: TAG_BITS,
      ...(additionalData ? { additionalData } : {}),
    },
    key,
    toArrayBuffer(parsed.data),
  );
  return utf8Decode(new Uint8Array(plain));
}

function toKeyring(keyring: string | EncryptionKeyring): EncryptionKeyring {
  return typeof keyring === 'string' ? { current: keyring } : keyring;
}

/** Decrypt trying the current key, then the previous key (rotation). */
export async function decryptStringDetailed(
  payload: string,
  keyring: string | EncryptionKeyring,
  opts: EncryptOptions = {},
): Promise<DecryptResult> {
  const parsed = parseEncryptedPayload(payload);
  const ring = toKeyring(keyring);
  const currentKey = await importEncryptionKey(ring.current);
  try {
    const plaintext = await decryptWithKey(parsed, currentKey, opts.aad);
    return { plaintext, keyUsed: 'current', needsReencrypt: false };
  } catch (currentError) {
    if (!ring.previous) throw cryptoError('decrypt_failed', currentError);
    const previousKey = await importEncryptionKey(ring.previous);
    try {
      const plaintext = await decryptWithKey(parsed, previousKey, opts.aad);
      return { plaintext, keyUsed: 'previous', needsReencrypt: true };
    } catch (previousError) {
      throw cryptoError('decrypt_failed', previousError);
    }
  }
}

export async function decryptString(
  payload: string,
  keyring: string | EncryptionKeyring,
  opts: EncryptOptions = {},
): Promise<string> {
  return (await decryptStringDetailed(payload, keyring, opts)).plaintext;
}

export function needsReencrypt(result: DecryptResult): boolean {
  return result.keyUsed === 'previous';
}

export interface ReencryptResult {
  payload: string;
  rotated: boolean;
}

export interface TokenCipher {
  encrypt(plaintext: string, opts?: EncryptOptions): Promise<string>;
  decrypt(payload: string, opts?: EncryptOptions): Promise<string>;
  decryptDetailed(payload: string, opts?: EncryptOptions): Promise<DecryptResult>;
  /** Returns a payload encrypted with the current key; `rotated` says whether it changed. */
  reencryptIfNeeded(payload: string, opts?: EncryptOptions): Promise<ReencryptResult>;
}

/** Cipher bound to a keyring; keys are imported once and reused. */
export function createTokenCipher(keyring: string | EncryptionKeyring): TokenCipher {
  const ring = toKeyring(keyring);
  let currentKey: Promise<CryptoKey> | null = null;
  let previousKey: Promise<CryptoKey> | null = null;
  const current = () => (currentKey ??= importEncryptionKey(ring.current));
  const previous = () =>
    ring.previous ? (previousKey ??= importEncryptionKey(ring.previous)) : null;

  const decryptDetailed = async (
    payload: string,
    opts: EncryptOptions = {},
  ): Promise<DecryptResult> => {
    const parsed = parseEncryptedPayload(payload);
    try {
      const plaintext = await decryptWithKey(parsed, await current(), opts.aad);
      return { plaintext, keyUsed: 'current', needsReencrypt: false };
    } catch (currentError) {
      const prev = previous();
      if (!prev) throw cryptoError('decrypt_failed', currentError);
      try {
        const plaintext = await decryptWithKey(parsed, await prev, opts.aad);
        return { plaintext, keyUsed: 'previous', needsReencrypt: true };
      } catch (previousError) {
        throw cryptoError('decrypt_failed', previousError);
      }
    }
  };

  return {
    encrypt: async (plaintext, opts) => encryptString(plaintext, await current(), opts),
    decrypt: async (payload, opts) => (await decryptDetailed(payload, opts)).plaintext,
    decryptDetailed,
    reencryptIfNeeded: async (payload, opts) => {
      const result = await decryptDetailed(payload, opts);
      if (!result.needsReencrypt) return { payload, rotated: false };
      return {
        payload: await encryptString(result.plaintext, await current(), opts),
        rotated: true,
      };
    },
  };
}
