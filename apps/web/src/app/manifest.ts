import { type MetadataRoute } from 'next';
import { getDictionary } from '@/i18n';
import { getLang } from '@/i18n/server';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const lang = await getLang();
  const t = getDictionary(lang);
  return {
    name: t.meta.siteName,
    short_name: t.meta.siteName,
    description: t.meta.description,
    lang,
    start_url: '/',
    display: 'minimal-ui',
    background_color: '#F5F4F0',
    theme_color: '#5B5CE2',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
