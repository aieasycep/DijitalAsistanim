import { type Metadata } from 'next';
import Link from 'next/link';
import { ArrowRightIcon } from '@/components/Icons';
import { getDictionary } from '@/i18n';
import { getLang, getPageContext, type SearchParams } from '@/i18n/server';
import { SITE } from '@/lib/env';
import { pageMetadata } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  const t = getDictionary(lang);
  return pageMetadata({
    lang,
    path: '/support',
    title: t.supportPage.title,
    description: t.supportPage.description,
  });
}

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { t } = await getPageContext('/support', await searchParams);
  const s = t.supportPage;
  const links = [
    { href: '/#how', label: t.nav.howItWorks },
    { href: '/#faq', label: t.faq.title },
    { href: '/pricing', label: t.nav.pricing },
    { href: '/data-deletion', label: t.footer.dataDeletion },
    { href: '/oauth', label: t.footer.oauth },
    { href: '/privacy', label: t.footer.privacy },
    { href: '/terms', label: t.footer.terms },
  ];

  return (
    <div className="page">
      <div className="container">
        <header className="page-head">
          <p className="kicker">{s.title}</p>
          <h1 className="h1">{s.title}</h1>
          <p className="lead">{s.intro}</p>
        </header>

        <div className="card contact-card">
          <div>
            <p className="kicker">{s.emailLabel}</p>
            <a className="contact-email" href={`mailto:${SITE.supportEmail}`}>
              {SITE.supportEmail}
            </a>
            <p className="secondary" style={{ marginTop: 6 }}>
              {s.responseTime}
            </p>
          </div>
          <a className="btn btn-primary" href={`mailto:${SITE.supportEmail}`}>
            {s.emailLabel}
            <ArrowRightIcon size={18} />
          </a>
        </div>

        <section className="page-section" aria-labelledby="inapp-title">
          <h2 id="inapp-title" className="h3">
            {s.inAppTitle}
          </h2>
          <p
            className="secondary"
            style={{ fontSize: 15, lineHeight: '22px', marginTop: 8, maxWidth: 640 }}
          >
            {s.inAppBody}
          </p>
        </section>

        <section className="page-section" aria-labelledby="topics-title">
          <h2 id="topics-title" className="h2">
            {s.topicsTitle}
          </h2>
          <div className="card-grid">
            {s.topics.map((topic) => (
              <div key={topic.title} className="card">
                <h3 className="h4">{topic.title}</h3>
                <p className="secondary" style={{ fontSize: 15, lineHeight: '22px' }}>
                  {topic.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="page-section" aria-labelledby="links-title">
          <h2 id="links-title" className="h3" style={{ marginBottom: 14 }}>
            {s.linksTitle}
          </h2>
          <ul className="link-list">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href}>
                  {l.label}
                  <ArrowRightIcon size={14} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
