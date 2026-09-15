import { type Dictionary } from '@/i18n';
import { publicEnv, SITE } from '@/lib/env';
import { betaMailto } from '@/lib/links';
import { ArrowUpRightIcon, DownloadIcon, PhoneIcon } from './Icons';

/**
 * Store links from env. Both badges are drawn with our own glyphs and typography — no third-party
 * logos. When neither store URL is configured, the beta path is shown instead (never a dead button).
 */
export function StoreBadges({ t, compact = false }: { t: Dictionary; compact?: boolean }) {
  const ios = publicEnv.appStoreUrl;
  const android = publicEnv.playStoreUrl;

  if (!ios && !android) {
    return (
      <div className="store-fallback">
        {!compact && <p className="secondary">{t.download.bodyBeta}</p>}
        <a className="btn btn-dark" href={betaMailto(t.download.requestSubject, SITE.supportEmail)}>
          <DownloadIcon size={18} />
          {t.download.requestAccess}
        </a>
      </div>
    );
  }

  return (
    <div className="store-badges">
      {ios && (
        <a className="store-badge" href={ios} rel="noopener noreferrer" target="_blank">
          <PhoneIcon size={22} />
          <span className="store-badge-text">
            <span className="store-badge-sub">{t.download.appStoreSub}</span>
            <span className="store-badge-name">{t.download.appStore}</span>
          </span>
          <ArrowUpRightIcon size={16} className="store-badge-arrow" />
        </a>
      )}
      {android && (
        <a className="store-badge" href={android} rel="noopener noreferrer" target="_blank">
          <PhoneIcon size={22} />
          <span className="store-badge-text">
            <span className="store-badge-sub">{t.download.googlePlaySub}</span>
            <span className="store-badge-name">{t.download.googlePlay}</span>
          </span>
          <ArrowUpRightIcon size={16} className="store-badge-arrow" />
        </a>
      )}
    </div>
  );
}
