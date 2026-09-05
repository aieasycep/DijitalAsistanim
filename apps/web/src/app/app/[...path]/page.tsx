import { toSchemeUrl } from '@da/domain';
import { type Metadata } from 'next';
import Link from 'next/link';
import { DeepLinkOpener } from '@/components/DeepLinkOpener';
import { ArrowRightIcon, SparkleIcon } from '@/components/Icons';
import { StoreBadges } from '@/components/StoreBadges';
import { getDictionary } from '@/i18n';
import { getLang, getPageContext, type SearchParams } from '@/i18n/server';
import { pageMetadata } from '@/lib/seo';

interface Params {
  path: string[];
}

function appPath(segments: string[], searchParams: SearchParams): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === 'lang' || value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) query.append(key, v);
  }
  const path = `/${segments.map((s) => encodeURIComponent(decodeURIComponent(s))).join('/')}`;
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const lang = await getLang();
  const t = getDictionary(lang);
  const { path } = await params;
  return pageMetadata({
    lang,
    path: `/app/${path.join('/')}`,
    title: t.appLink.title,
    description: t.appLink.body,
    noindex: true,
  });
}

/**
 * Universal / App Link fallback. Reached when the app is not installed (or on desktop) for
 * https://<host>/app/<path>. Mirrors the deep link `dijitalasistan://<path>` and offers the stores.
 */
export default async function AppLinkPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}) {
  const { path } = await params;
  const sp = await searchParams;
  const { t } = await getPageContext(`/app/${path.join('/')}`, sp);
  const target = appPath(path, sp);
  const deepLink = toSchemeUrl(target);
  const isReferral = path[0] === 'referral';
  const code = typeof sp.code === 'string' ? sp.code : undefined;

  return (
    <div className="page">
      <div className="container applink">
        <DeepLinkOpener href={deepLink} />
        <span className="logo-tile" aria-hidden="true">
          <SparkleIcon size={34} />
        </span>
        {isReferral && code ? (
          <>
            <h1 className="h1">{t.appLink.referralTitle}</h1>
            <p className="lead">{t.appLink.referralBody}</p>
            <p className="kicker" style={{ marginTop: 20 }}>
              {t.appLink.codeLabel}
            </p>
            <span className="applink-code">{code}</span>
          </>
        ) : (
          <>
            <h1 className="h1">{t.appLink.title}</h1>
            <p className="lead">{t.appLink.body}</p>
          </>
        )}
        <div className="hero-actions">
          <a className="btn btn-primary btn-lg" href={deepLink}>
            {t.appLink.openInApp}
            <ArrowRightIcon size={18} />
          </a>
        </div>
        <p className="caption" style={{ marginTop: 12 }}>
          {t.appLink.autoNote}
        </p>
        <a className="applink-deeplink" href={deepLink} aria-label={t.appLink.deepLinkLabel}>
          {deepLink}
        </a>
        <p className="h4" style={{ marginTop: 40 }}>
          {t.appLink.orInstall}
        </p>
        <StoreBadges t={t} compact />
        <p style={{ marginTop: 32 }}>
          <Link href="/">{t.appLink.backHome}</Link>
        </p>
      </div>
    </div>
  );
}
