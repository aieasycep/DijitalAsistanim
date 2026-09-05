import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  DEFAULT_LANG,
  LANG_COOKIE,
  getDictionary,
  isLang,
  type Dictionary,
  type Lang,
} from './index';

export type SearchParams = Record<string, string | string[] | undefined>;

/** Language from the persisted cookie (layout, metadata). */
export async function getLang(): Promise<Lang> {
  const store = await cookies();
  const value = store.get(LANG_COOKIE)?.value;
  return isLang(value) ? value : DEFAULT_LANG;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Language for a page. A `?lang=` query param is persisted through the `/lang` route handler
 * (which sets the cookie and redirects back to the clean URL) so that the whole document —
 * including <html lang> — renders consistently from one source.
 */
export async function resolveLang(pathname: string, searchParams: SearchParams): Promise<Lang> {
  const requested = firstValue(searchParams.lang);
  if (isLang(requested)) {
    const rest = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (key === 'lang' || value === undefined) continue;
      for (const v of Array.isArray(value) ? value : [value]) rest.append(key, v);
    }
    const query = rest.toString();
    const next = query ? `${pathname}?${query}` : pathname;
    redirect(`/lang?to=${requested}&next=${encodeURIComponent(next)}`);
  }
  return getLang();
}

export async function getPageContext(
  pathname: string,
  searchParams: SearchParams,
): Promise<{ lang: Lang; t: Dictionary }> {
  const lang = await resolveLang(pathname, searchParams);
  return { lang, t: getDictionary(lang) };
}
