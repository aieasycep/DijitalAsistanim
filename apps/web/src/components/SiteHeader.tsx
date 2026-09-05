import Link from 'next/link';
import { type Dictionary } from '@/i18n';
import { ctaHref } from '@/lib/links';
import { MenuIcon, SparkleIcon } from './Icons';
import { LangSwitch } from './LangSwitch';

export function Logo({ name }: { name: string }) {
  return (
    <Link href="/" className="logo" aria-label={name}>
      <span className="logo-tile" aria-hidden="true">
        <SparkleIcon size={18} />
      </span>
      <span className="logo-name">{name}</span>
    </Link>
  );
}

export function SiteHeader({ t }: { t: Dictionary }) {
  const links = [
    { href: '/#how', label: t.nav.howItWorks },
    { href: '/#security', label: t.nav.security },
    { href: '/pricing', label: t.nav.pricing },
    { href: '/support', label: t.nav.support },
  ];
  return (
    <header className="site-header">
      <div className="container header-row">
        <Logo name={t.meta.siteName} />
        <nav className="nav-desktop" aria-label={t.nav.home}>
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="nav-link">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          <LangSwitch
            to={t.nav.switchToLang}
            label={t.nav.switchTo}
            ariaLabel={`${t.nav.language}: ${t.nav.switchTo}`}
            className="lang-link"
          />
          <Link href={ctaHref()} className="btn btn-primary btn-sm">
            {t.nav.cta}
          </Link>
          <details className="nav-mobile">
            <summary aria-label={t.nav.home}>
              <MenuIcon size={22} />
            </summary>
            <div className="nav-mobile-panel">
              {links.map((l) => (
                <Link key={l.href} href={l.href} className="nav-link">
                  {l.label}
                </Link>
              ))}
              <LangSwitch
                to={t.nav.switchToLang}
                label={t.nav.switchTo}
                ariaLabel={`${t.nav.language}: ${t.nav.switchTo}`}
                className="nav-link lang-link"
              />
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
