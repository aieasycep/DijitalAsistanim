import { type NextRequest, NextResponse } from 'next/server';
import { isLang, LANG_HEADER } from '@/i18n/lang';

/**
 * Makes `?lang=en` a directly rendered URL instead of a redirect: the language named in the search
 * param travels to the server components as the `x-da-lang` request header, which `getLang()` reads
 * before the cookie. Nothing is persisted here — the cookie is written only by the explicit toggle
 * (`/lang`). Any incoming `x-da-lang` header is dropped first so the value can only come from the URL.
 */
export function proxy(req: NextRequest): NextResponse {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.delete(LANG_HEADER);
  const requested = req.nextUrl.searchParams.get('lang');
  if (isLang(requested)) requestHeaders.set(LANG_HEADER, requested);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  // Everything except Next internals and the App/Universal Link association files.
  matcher: ['/((?!_next/|.well-known/).*)'],
};
