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

export function pageMetadata({
  lang,
  path,
  title,
  description,
  noindex = false,
}: PageMeta): Metadata {
  const url = absoluteUrl(path);
  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: {
        tr: url,
        en: `${url}?lang=en`,
        'x-default': url,
      },
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
