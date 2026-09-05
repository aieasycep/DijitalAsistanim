import Link from 'next/link';
import { type Dictionary } from '@/i18n';
import { SITE } from '@/lib/env';
import { Logo } from './SiteHeader';
import { LangSwitch } from './LangSwitch';

export function SiteFooter({ t, year }: { t: Dictionary; year: number }) {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <Logo name={t.meta.siteName} />
            <p className="footer-tagline">{t.footer.tagline}</p>
          </div>
          <nav aria-label={t.footer.product}>
            <h2 className="footer-heading">{t.footer.product}</h2>
            <ul className="footer-list">
              <li>
                <Link href="/#how">{t.nav.howItWorks}</Link>
              </li>
              <li>
                <Link href="/pricing">{t.nav.pricing}</Link>
              </li>
              <li>
                <Link href="/#security">{t.nav.security}</Link>
              </li>
              <li>
                <Link href="/support">{t.footer.support}</Link>
              </li>
            </ul>
          </nav>
          <nav aria-label={t.footer.legal}>
            <h2 className="footer-heading">{t.footer.legal}</h2>
            <ul className="footer-list">
              <li>
                <Link href="/privacy">{t.footer.privacy}</Link>
              </li>
              <li>
                <Link href="/terms">{t.footer.terms}</Link>
              </li>
              <li>
                <Link href="/data-deletion">{t.footer.dataDeletion}</Link>
              </li>
              <li>
                <Link href="/oauth">{t.footer.oauth}</Link>
              </li>
            </ul>
          </nav>
          <div>
            <h2 className="footer-heading">{t.footer.contact}</h2>
            <ul className="footer-list">
              <li>
                <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>
              </li>
              <li>
                <a href={`mailto:${SITE.privacyEmail}`}>{SITE.privacyEmail}</a>
              </li>
            </ul>
            <h2 className="footer-heading footer-heading-gap">{t.footer.languageLabel}</h2>
            <LangSwitch
              to={t.nav.switchToLang}
              label={t.nav.switchTo}
              ariaLabel={`${t.nav.language}: ${t.nav.switchTo}`}
              className="lang-link"
            />
          </div>
        </div>
        <p className="footer-copy">
          © {year} {t.meta.siteName}. {t.footer.rights}
        </p>
      </div>
    </footer>
  );
}
