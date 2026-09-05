import { type Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowUpRightIcon,
  CheckCircleIcon,
  LockIcon,
  ShieldIcon,
  SparkleIcon,
} from '@/components/Icons';
import { getDictionary, type Dictionary, type ScopeRow } from '@/i18n';
import { getLang, getPageContext, type SearchParams } from '@/i18n/server';
import { SITE } from '@/lib/env';
import { pageMetadata } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  const t = getDictionary(lang);
  return pageMetadata({
    lang,
    path: '/oauth',
    title: t.oauthPage.title,
    description: t.oauthPage.description,
  });
}

const GOOGLE_PREFIX = 'https://www.googleapis.com/auth/';

function scopeCode(scope: string, provider: 'google' | 'microsoft'): string {
  if (provider === 'google' && !scope.includes('·')) return `${GOOGLE_PREFIX}${scope}`;
  return scope;
}

function ScopeTable({
  rows,
  provider,
  t,
  caption,
}: {
  rows: ScopeRow[];
  provider: 'google' | 'microsoft';
  t: Dictionary;
  caption: string;
}) {
  const o = t.oauthPage;
  return (
    <div className="table-wrap" style={{ marginTop: 16 }}>
      <table className="scope-table">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{o.colLabel}</th>
            <th scope="col">{o.colScope}</th>
            <th scope="col">{o.colWhy}</th>
            <th scope="col">{o.colWhen}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.scope}>
              <th scope="row">{r.label}</th>
              <td>
                <code>{scopeCode(r.scope, provider)}</code>
              </td>
              <td className="why">{r.why}</td>
              <td>{r.when}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const principleIcons = [LockIcon, SparkleIcon, CheckCircleIcon, ShieldIcon] as const;

export default async function OAuthPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { t } = await getPageContext('/oauth', await searchParams);
  const o = t.oauthPage;

  return (
    <div className="page">
      <div className="container">
        <header className="page-head">
          <p className="kicker">{t.security.kicker}</p>
          <h1 className="h1">{o.title}</h1>
          <p className="lead">{o.intro}</p>
        </header>

        <section aria-labelledby="principles-title">
          <h2 id="principles-title" className="h2" style={{ marginBottom: 16 }}>
            {o.principlesTitle}
          </h2>
          <div className="promises">
            {o.principles.map((p, i) => {
              const Icon = principleIcons[i] ?? ShieldIcon;
              return (
                <div key={p.title} className="promise">
                  <span className="promise-icon">
                    <Icon size={20} />
                  </span>
                  <div>
                    <h3 className="h4">{p.title}</h3>
                    <p className="secondary" style={{ fontSize: 15, lineHeight: '22px' }}>
                      {p.body}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="page-section" aria-labelledby="google-title">
          <h2 id="google-title" className="h2">
            {o.googleTitle}
          </h2>
          <p className="secondary" style={{ fontSize: 15, lineHeight: '22px', maxWidth: 720 }}>
            {o.googleIntro}
          </p>
          <h3 className="h4" style={{ marginTop: 24 }}>
            {o.readHeading}
          </h3>
          <ScopeTable
            rows={o.googleRead}
            provider="google"
            t={t}
            caption={`${o.googleTitle} — ${o.readHeading}`}
          />
          <h3 className="h4" style={{ marginTop: 24 }}>
            {o.writeHeading}
          </h3>
          <ScopeTable
            rows={o.googleWrite}
            provider="google"
            t={t}
            caption={`${o.googleTitle} — ${o.writeHeading}`}
          />
        </section>

        <section className="page-section" aria-labelledby="microsoft-title">
          <h2 id="microsoft-title" className="h2">
            {o.microsoftTitle}
          </h2>
          <p className="secondary" style={{ fontSize: 15, lineHeight: '22px', maxWidth: 720 }}>
            {o.microsoftIntro}
          </p>
          <h3 className="h4" style={{ marginTop: 24 }}>
            {o.readHeading}
          </h3>
          <ScopeTable
            rows={o.microsoftRead}
            provider="microsoft"
            t={t}
            caption={`${o.microsoftTitle} — ${o.readHeading}`}
          />
          <h3 className="h4" style={{ marginTop: 24 }}>
            {o.writeHeading}
          </h3>
          <ScopeTable
            rows={o.microsoftWrite}
            provider="microsoft"
            t={t}
            caption={`${o.microsoftTitle} — ${o.writeHeading}`}
          />
        </section>

        <section className="page-section" aria-labelledby="apple-title">
          <h2 id="apple-title" className="h3">
            {o.appleTitle}
          </h2>
          <p
            className="secondary"
            style={{ fontSize: 15, lineHeight: '22px', marginTop: 8, maxWidth: 720 }}
          >
            {o.appleBody}
          </p>
        </section>

        <section className="page-section" aria-labelledby="datause-title">
          <h2 id="datause-title" className="h2">
            {o.dataUseTitle}
          </h2>
          <ul className="bullets">
            {o.dataUse.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </section>

        <section className="page-section" aria-labelledby="limited-title">
          <h2 id="limited-title" className="h3" style={{ marginBottom: 12 }}>
            {o.limitedUseTitle}
          </h2>
          <p className="statement" lang="tr">
            {o.limitedUseTr}
          </p>
          <p className="statement" lang="en">
            {o.limitedUseEn}
          </p>
        </section>

        <section className="page-section" aria-labelledby="revoke-title">
          <h2 id="revoke-title" className="h2">
            {o.revokeTitle}
          </h2>
          <p
            className="secondary"
            style={{ fontSize: 15, lineHeight: '22px', maxWidth: 720, marginBottom: 16 }}
          >
            {o.revokeIntro}
          </p>
          <div className="card-grid">
            {o.revokeSteps.map((step) => (
              <div key={step.title} className="card">
                <h3 className="h4">{step.title}</h3>
                <p className="secondary" style={{ fontSize: 15, lineHeight: '22px' }}>
                  {step.body}
                </p>
                {step.href && step.linkLabel && (
                  <p style={{ marginTop: 12 }}>
                    <a
                      href={step.href}
                      rel="noopener noreferrer"
                      target="_blank"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontWeight: 600,
                      }}
                    >
                      {step.linkLabel}
                      <ArrowUpRightIcon size={16} />
                    </a>
                  </p>
                )}
              </div>
            ))}
          </div>
          <p
            className="secondary"
            style={{ fontSize: 15, lineHeight: '22px', marginTop: 20, maxWidth: 720 }}
          >
            {o.revokeNote} <Link href="/data-deletion">{t.footer.dataDeletion}</Link>
          </p>
          <p className="secondary" style={{ marginTop: 12 }}>
            {o.contact}
            <a href={`mailto:${SITE.privacyEmail}`}>{SITE.privacyEmail}</a>
          </p>
        </section>
      </div>
    </div>
  );
}
