// LEGAL REVIEW REQUIRED before publishing — draft prepared by engineering.
import { type Metadata } from 'next';
import { LegalDocument } from '@/components/LegalDocument';
import { getDictionary } from '@/i18n';
import { getLang, getPageContext } from '@/i18n/server';
import { pageMetadata } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  const t = getDictionary(lang);
  return pageMetadata({
    lang,
    path: '/privacy',
    title: t.legal.privacy.title,
    description: t.legal.privacy.intro,
  });
}

export default async function PrivacyPage() {
  const { t } = await getPageContext();
  return (
    <div className="page">
      <div className="container">
        <LegalDocument doc={t.legal.privacy} t={t} />
      </div>
    </div>
  );
}
