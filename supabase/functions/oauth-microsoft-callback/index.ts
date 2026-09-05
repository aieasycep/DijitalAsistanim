/** GET /oauth-microsoft-callback?code&state — Microsoft redirect target (no user JWT; state is HMAC-verified). */
import { handleOAuthCallback } from '../_shared/oauthCallback.ts';
import { preflight } from '../_shared/mod.ts';

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'GET') return new Response('Method Not Allowed', { status: 405 });
  return handleOAuthCallback(req, 'microsoft');
});
