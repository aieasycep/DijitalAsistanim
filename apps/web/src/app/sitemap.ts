import { type MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo';

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

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date('2026-09-05T00:00:00Z');
  return ROUTES.map((r) => {
    const url = absoluteUrl(r.path);
    return {
      url,
      lastModified,
      changeFrequency: r.changeFrequency,
      priority: r.priority,
      alternates: { languages: { tr: url, en: `${url}?lang=en` } },
    };
  });
}
