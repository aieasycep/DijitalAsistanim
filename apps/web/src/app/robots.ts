import { type MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/lang', '/app/', '/referral/'] }],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: absoluteUrl(''),
  };
}
