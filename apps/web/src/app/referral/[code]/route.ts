import { type NextRequest } from 'next/server';

/** Short invite links (/referral/CODE) resolve to the universal-link fallback for the app. */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ code: string }> },
): Promise<Response> {
  const { code } = await ctx.params;
  const safe = code.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
  return new Response(null, {
    status: 307,
    headers: { Location: `/app/referral?code=${encodeURIComponent(safe)}` },
  });
}
