import { fontFamilies } from '@da/design-tokens';
import { type Metadata, type Viewport } from 'next';
import { Geist, Lora } from 'next/font/google';
import { type ReactNode } from 'react';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { getDictionary, htmlLang, ogLocale } from '@/i18n';
import { getLang } from '@/i18n/server';
import { publicEnv } from '@/lib/env';
import { themeCss } from '@/lib/theme';
import './globals.css';

const geist = Geist({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-geist',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

const lora = Lora({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-lora',
  display: 'swap',
  style: ['normal', 'italic'],
  weight: ['400', '500', '600'],
});

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  const t = getDictionary(lang);
  const title = `${t.meta.siteName} — ${t.meta.tagline}`;
  return {
    metadataBase: new URL(publicEnv.webUrl),
    title: { default: title, template: `%s · ${t.meta.siteName}` },
    description: t.meta.description,
    applicationName: t.meta.siteName,
    openGraph: {
      siteName: t.meta.siteName,
      type: 'website',
      locale: ogLocale(lang),
      title,
      description: t.meta.description,
    },
    twitter: { card: 'summary_large_image', title, description: t.meta.description },
    robots: { index: true, follow: true },
    appleWebApp: { title: t.meta.siteName },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F5F4F0' },
    { media: '(prefers-color-scheme: dark)', color: '#141311' },
  ],
};

const fontVars = `:root{--da-font-sans:${fontFamilies.webSansStack};--da-font-serif:${fontFamilies.webSerifStack}}`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const lang = await getLang();
  const t = getDictionary(lang);
  return (
    <html lang={htmlLang(lang)} className={`${geist.variable} ${lora.variable}`}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: themeCss() + fontVars }} />
      </head>
      <body>
        <a className="skip-link" href="#main">
          {t.nav.skipToContent}
        </a>
        <SiteHeader t={t} />
        <main id="main">{children}</main>
        <SiteFooter t={t} year={new Date().getFullYear()} />
      </body>
    </html>
  );
}
