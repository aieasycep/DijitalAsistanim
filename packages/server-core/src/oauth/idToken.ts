/**
 * ID token claim reader — NO signature verification.
 *
 * Sign-in tokens are verified by Supabase Auth. This helper only reads `sub`/`email` from the
 * id_token a data-source connection received directly from the provider's token endpoint over
 * TLS (so the channel, not the signature, is what we rely on). Never use it to authenticate a
 * token that arrived from a client.
 */
import { z } from 'zod';
import { base64UrlToBytes, utf8Decode } from '../crypto';

export interface IdTokenClaims {
  iss: string;
  sub: string;
  aud: string[];
  exp: number;
  iat: number | null;
  email: string | null;
  emailVerified: boolean | null;
  name: string | null;
  picture: string | null;
  /** Microsoft: tenant id. */
  tid: string | null;
  /** Microsoft: sign-in name (UPN). */
  preferredUsername: string | null;
  nonce: string | null;
}

const claimsSchema = z.object({
  iss: z.string().min(1),
  sub: z.string().min(1),
  aud: z.union([z.string(), z.array(z.string())]),
  exp: z.number(),
  iat: z.number().nullish(),
  email: z.string().nullish(),
  email_verified: z.union([z.boolean(), z.enum(['true', 'false'])]).nullish(),
  name: z.string().nullish(),
  picture: z.string().nullish(),
  tid: z.string().nullish(),
  preferred_username: z.string().nullish(),
  nonce: z.string().nullish(),
});

function decodeSegment(segment: string): unknown {
  return JSON.parse(utf8Decode(base64UrlToBytes(segment)));
}

/** Returns null for anything that is not a well-formed JWT with the expected claims. */
export function parseIdToken(idToken: string): IdTokenClaims | null {
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  let payload: unknown;
  try {
    const header = decodeSegment(parts[0] ?? '');
    if (typeof header !== 'object' || header === null) return null;
    payload = decodeSegment(parts[1] ?? '');
  } catch {
    return null;
  }
  const parsed = claimsSchema.safeParse(payload);
  if (!parsed.success) return null;
  const c = parsed.data;
  const email = c.email?.trim().toLowerCase() || null;
  const emailVerified =
    c.email_verified === undefined || c.email_verified === null
      ? null
      : c.email_verified === true || c.email_verified === 'true';
  return {
    iss: c.iss,
    sub: c.sub,
    aud: Array.isArray(c.aud) ? c.aud : [c.aud],
    exp: c.exp,
    iat: c.iat ?? null,
    email,
    emailVerified,
    name: c.name?.trim() || null,
    picture: c.picture || null,
    tid: c.tid || null,
    preferredUsername: c.preferred_username?.trim().toLowerCase() || null,
    nonce: c.nonce || null,
  };
}

export function isIdTokenExpired(
  claims: Pick<IdTokenClaims, 'exp'>,
  now: Date = new Date(),
  skewSec = 60,
): boolean {
  return claims.exp * 1000 + skewSec * 1000 <= now.getTime();
}

/** Best identifier for the connected mailbox: email, else Microsoft UPN, else subject. */
export function externalAccountIdFrom(claims: IdTokenClaims): string {
  return claims.email ?? claims.preferredUsername ?? claims.sub;
}
