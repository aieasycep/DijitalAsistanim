import { cookies, headers } from 'next/headers';
import { getDictionary, type Dictionary, type Lang } from './index';
import { DEFAULT_LANG, isLang, LANG_COOKIE, LANG_HEADER } from './lang';

export type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Language of the current request, in priority order:
 * 1. `x-da-lang`, which `src/proxy.ts` derives from an explicit `?lang=` search param — this makes
 *    `/path?lang=en` a stable, cookie-less URL that renders English directly (crawlers, hreflang,
 *    sitemap) without any redirect;
 * 2. the `da_lang` cookie, written only by the `/lang` toggle;
 * 3. Turkish.
 * Layout, metadata and pages all read this, so `<html lang>` and the copy always agree.
 */
export async function getLang(): Promise<Lang> {
  const [hdrs, store] = await Promise.all([headers(), cookies()]);
  const fromUrl = hdrs.get(LANG_HEADER);
  if (isLang(fromUrl)) return fromUrl;
  const fromCookie = store.get(LANG_COOKIE)?.value;
  return isLang(fromCookie) ? fromCookie : DEFAULT_LANG;
}

export async function getPageContext(): Promise<{ lang: Lang; t: Dictionary }> {
  const lang = await getLang();
  return { lang, t: getDictionary(lang) };
}
