/**
 * OAuth `state` tokens: HMAC-SHA256 signed, expiring, self-describing.
 * Format: `<base64url payload json>.<base64url signature>`.
 *
 * The PKCE verifier is deliberately NOT part of the state (it travels through the browser);
 * edge functions store it server-side keyed by `nonce`.
 */
import { z } from 'zod';
import {
  base64UrlToBytes,
  bytesToBase64Url,
  hmacSha256,
  randomToken,
  timingSafeEqualBytes,
  utf8Decode,
  utf8Encode,
} from '../crypto';
import {
  OAUTH_KINDS,
  OAUTH_PROVIDERS,
  OAUTH_SCOPE_GROUPS,
  type OAuthKind,
  type OAuthProvider,
  type OAuthScopeGroup,
} from './scopes';

export const DEFAULT_OAUTH_STATE_TTL_SEC = 10 * 60;
const STATE_VERSION = 1;

export interface OAuthStatePayload {
  userId: string;
  provider: OAuthProvider;
  kinds: OAuthKind[];
  redirectTo: string;
  accountId: string | null;
  scopeGroup: OAuthScopeGroup;
  /** Random id; also the key under which the PKCE verifier is stored server-side. */
  nonce: string;
  /** Unix seconds. */
  iat: number;
  exp: number;
}

const payloadSchema = z.object({
  v: z.literal(STATE_VERSION),
  userId: z.string().min(1).max(128),
  provider: z.enum(OAUTH_PROVIDERS),
  kinds: z.array(z.enum(OAUTH_KINDS)).min(1).max(OAUTH_KINDS.length),
  redirectTo: z.string().min(1).max(300),
  accountId: z.string().min(1).max(128).nullable(),
  scopeGroup: z.enum(OAUTH_SCOPE_GROUPS),
  nonce: z.string().min(16).max(128),
  iat: z.number().int(),
  exp: z.number().int(),
});

export interface CreateOAuthStateInput {
  secret: string | Uint8Array;
  userId: string;
  provider: OAuthProvider;
  kinds: readonly OAuthKind[];
  redirectTo: string;
  accountId?: string | null;
  scopeGroup?: OAuthScopeGroup;
  ttlSec?: number;
  now?: Date;
  /** Provide to reuse a nonce generated elsewhere (e.g. as the PKCE storage key). */
  nonce?: string;
}

export interface CreatedOAuthState {
  state: string;
  payload: OAuthStatePayload;
  expiresAt: string;
}

export type OAuthStateVerification =
  | { ok: true; payload: OAuthStatePayload }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'invalid_payload' };

function assertSecret(secret: string | Uint8Array): void {
  const length = typeof secret === 'string' ? utf8Encode(secret).length : secret.length;
  if (length < 32) throw new Error('OAuth state secret en az 32 bayt olmalı');
}

async function sign(secret: string | Uint8Array, payloadSegment: string): Promise<Uint8Array> {
  return hmacSha256(secret, `oauth-state:${payloadSegment}`);
}

export async function createOAuthState(input: CreateOAuthStateInput): Promise<CreatedOAuthState> {
  assertSecret(input.secret);
  const now = input.now ?? new Date();
  const iat = Math.floor(now.getTime() / 1000);
  const ttl = Math.min(Math.max(input.ttlSec ?? DEFAULT_OAUTH_STATE_TTL_SEC, 30), 60 * 60);
  const kinds = OAUTH_KINDS.filter((k) => input.kinds.includes(k));
  const payload: OAuthStatePayload = {
    userId: input.userId,
    provider: input.provider,
    kinds,
    redirectTo: input.redirectTo,
    accountId: input.accountId ?? null,
    scopeGroup: input.scopeGroup ?? 'read',
    nonce: input.nonce ?? randomToken(24),
    iat,
    exp: iat + ttl,
  };
  const validated = payloadSchema.parse({ v: STATE_VERSION, ...payload });
  const payloadSegment = bytesToBase64Url(utf8Encode(JSON.stringify(validated)));
  const signature = bytesToBase64Url(await sign(input.secret, payloadSegment));
  return {
    state: `${payloadSegment}.${signature}`,
    payload,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  };
}

export async function verifyOAuthState(input: {
  secret: string | Uint8Array;
  state: string;
  now?: Date;
}): Promise<OAuthStateVerification> {
  assertSecret(input.secret);
  const parts = input.state.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'malformed' };
  const [payloadSegment, signatureSegment] = parts as [string, string];

  let provided: Uint8Array;
  try {
    provided = base64UrlToBytes(signatureSegment);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  const expected = await sign(input.secret, payloadSegment);
  if (!timingSafeEqualBytes(expected, provided)) return { ok: false, reason: 'bad_signature' };

  let json: unknown;
  try {
    json = JSON.parse(utf8Decode(base64UrlToBytes(payloadSegment)));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: 'invalid_payload' };

  const nowSec = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (parsed.data.exp <= nowSec) return { ok: false, reason: 'expired' };

  const { v: _version, ...payload } = parsed.data;
  return { ok: true, payload };
}
