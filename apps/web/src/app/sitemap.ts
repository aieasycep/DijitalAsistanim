import { type MetadataRoute } from 'next';
import { LANGS } from '@/i18n';
import { languageAlternates, langUrl } from '@/lib/seo';

const ROUTES: {
  path: string;
  priority: number;
  changeFrequency: 'weekly' | 'monthly' | 'yearly';
}[] = [
  { path: '/', priority: 1, changeFrequency: 'weekly' },
  { path: '/pricing', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/support', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/oauth', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/privacy', priority: 0.4, changeFrequency: 'yearly' },
  { path: '/terms', priority: 0.4, changeFrequency: 'yearly' },
  { path: '/data-deletion', priority: 0.4, changeFrequency: 'yearly' },
];

/** One entry per language for every route, each carrying the full hreflang set (Google's guidance). */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date('2026-09-13T00:00:00Z');
  return ROUTES.flatMap((r) =>
    LANGS.map((lang) => ({
      url: langUrl(r.path, lang),
      lastModified,
      changeFrequency: r.changeFrequency,
      priority: r.priority,
      alternates: { languages: languageAlternates(r.path) },
    })),
  );
}
