// LEGAL REVIEW REQUIRED before publishing — draft prepared by engineering.
import { type Metadata } from 'next';
import { LegalDocument } from '@/components/LegalDocument';
import { getDictionary } from '@/i18n';
import { getLang, getPageContext, type SearchParams } from '@/i18n/server';
import { pageMetadata } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  const t = getDictionary(lang);
  return pageMetadata({
    lang,
    path: '/data-deletion',
    title: t.legal.dataDeletion.title,
    description: t.legal.dataDeletion.intro,
  });
}

export default async function DataDeletionPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { t } = await getPageContext('/data-deletion', await searchParams);
  return (
    <div className="page">
      <div className="container">
        <LegalDocument doc={t.legal.dataDeletion} t={t} />
      </div>
    </div>
  );
}
