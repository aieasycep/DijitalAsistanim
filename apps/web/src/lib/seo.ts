import { type Metadata } from 'next';
import { ogLocale, type Lang } from '@/i18n';
import { publicEnv } from './env';

interface PageMeta {
  lang: Lang;
  path: string;
  title: string;
  description: string;
  noindex?: boolean;
}

export function absoluteUrl(path: string): string {
  return `${publicEnv.webUrl.replace(/\/$/, '')}${path}`;
}

/**
 * The URL that renders `path` in `lang` for a cookie-less client. Turkish is the bare URL; English
 * carries `?lang=en`, which `src/proxy.ts` turns into the `x-da-lang` header (no redirect).
 */
export function langUrl(path: string, lang: Lang): string {
  const url = absoluteUrl(path);
  if (lang !== 'en') return url;
  return `${url}${url.includes('?') ? '&' : '?'}lang=en`;
}

/** hreflang map shared by page metadata and the sitemap; `x-default` is the Turkish URL. */
export function languageAlternates(path: string): Record<string, string> {
  return {
    tr: langUrl(path, 'tr'),
    en: langUrl(path, 'en'),
    'x-default': langUrl(path, 'tr'),
  };
}

export function pageMetadata({
  lang,
  path,
  title,
  description,
  noindex = false,
}: PageMeta): Metadata {
  // Canonical points at the URL that renders the language actually served, so a cookie-driven
  // English render still declares the stable `?lang=en` URL as its canonical.
  const url = langUrl(path, lang);
  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: languageAlternates(path),
    },
    openGraph: {
      title,
      description,
      url,
      locale: ogLocale(lang),
      type: 'website',
    },
    robots: noindex ? { index: false, follow: false } : undefined,
  };
}
