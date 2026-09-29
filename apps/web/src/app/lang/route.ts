import { type NextRequest, NextResponse } from 'next/server';
import { isLang, LANG_COOKIE } from '@/i18n/lang';

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Same-origin path to return to. A `?lang=` left in it would win over the freshly set cookie
 * (see `src/proxy.ts`), so it is stripped.
 */
function safeNext(value: string | null): string {
  if (!value) return '/';
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  const url = new URL(value, 'http://localhost');
  url.searchParams.delete('lang');
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Persists the language choice in a cookie and returns to the page the user came from. */
export function GET(req: NextRequest): NextResponse {
  const to = req.nextUrl.searchParams.get('to');
  const next = safeNext(req.nextUrl.searchParams.get('next'));
  const res = new NextResponse(null, {
    status: 303,
    headers: { Location: next, 'Cache-Control': 'no-store' },
  });
  if (isLang(to)) {
    res.cookies.set(LANG_COOKIE, to, {
      path: '/',
      maxAge: ONE_YEAR,
      sameSite: 'lax',
      httpOnly: false,
    });
  }
  return res;
}
