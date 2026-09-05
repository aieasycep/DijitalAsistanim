import { type Metadata } from 'next';
import Link from 'next/link';
import { Faq } from '@/components/Faq';
import {
  ArrowRightIcon,
  CalendarIcon,
  CheckCircleIcon,
  LockIcon,
  MailIcon,
  ShieldIcon,
  SparkleIcon,
  TasksIcon,
} from '@/components/Icons';
import { PhoneMockup } from '@/components/PhoneMockup';
import { PricingPlans, PricingTable } from '@/components/Pricing';
import {
  AssistantScreen,
  BriefingCard,
  MailScreen,
  MeetingScreen,
  PlanScreen,
} from '@/components/Screens';
import { StoreBadges } from '@/components/StoreBadges';
import { getDictionary } from '@/i18n';
import { getLang, getPageContext, type SearchParams } from '@/i18n/server';
import { ctaHref, hasStoreLinks } from '@/lib/links';
import { pageMetadata } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  const t = getDictionary(lang);
  return pageMetadata({
    lang,
    path: '/',
    title: `${t.meta.siteName} — ${t.meta.tagline}`,
    description: t.meta.description,
  });
}

const integrationIcon = { mail: MailIcon, calendar: CalendarIcon, tasks: TasksIcon } as const;
const promiseIcons = [ShieldIcon, CheckCircleIcon, LockIcon, SparkleIcon] as const;

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { t } = await getPageContext('/', await searchParams);

  return (
    <>
      {/* Hero */}
      <section className="hero" aria-labelledby="hero-title">
        <div className="container hero-grid">
          <div className="hero-copy">
            <p className="kicker kicker-brand">{t.hero.kicker}</p>
            <h1 id="hero-title" className="display">
              {t.hero.title}
            </h1>
            <p className="lead">{t.hero.subtitle}</p>
            <div className="hero-actions">
              <Link href={ctaHref()} className="btn btn-primary btn-lg">
                {t.hero.ctaPrimary}
              </Link>
              <a href="#how" className="btn btn-ghost btn-lg">
                {t.hero.ctaSecondary}
                <ArrowRightIcon size={18} />
              </a>
            </div>
            <p className="secondary hero-note">{t.hero.note}</p>
          </div>
          <div className="hero-visual">
            <PhoneMockup t={t} />
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section className="integrations" aria-labelledby="integrations-title">
        <div className="container">
          <div className="section-head center" style={{ marginBottom: 0 }}>
            <p className="kicker">{t.integrations.kicker}</p>
            <h2 id="integrations-title" className="h2">
              {t.integrations.title}
            </h2>
          </div>
          <ul className="integration-list">
            {t.integrations.items.map((item) => {
              const Icon = integrationIcon[item.kind];
              return (
                <li key={item.name} className="integration-chip">
                  <span className={`integration-icon ${item.kind}`}>
                    <Icon size={15} />
                  </span>
                  {item.name}
                </li>
              );
            })}
          </ul>
          <p className="secondary" style={{ textAlign: 'center' }}>
            {t.integrations.note}
          </p>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="section" aria-labelledby="how-title">
        <div className="container">
          <div className="section-head center">
            <p className="kicker">{t.how.kicker}</p>
            <h2 id="how-title" className="h2">
              {t.how.title}
            </h2>
            <p className="lead">{t.how.subtitle}</p>
          </div>
          <ol className="steps" style={{ listStyle: 'none', padding: 0 }}>
            {t.how.steps.map((step, i) => (
              <li key={step.title} className="step">
                <span className="step-num" aria-hidden="true">
                  {i + 1}
                </span>
                <h3 className="h3">{step.title}</h3>
                <p className="secondary" style={{ fontSize: 15, lineHeight: '22px' }}>
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Morning briefing */}
      <section className="section" style={{ paddingTop: 0 }} aria-labelledby="briefing-title">
        <div className="container feature">
          <div className="feature-copy">
            <p className="kicker kicker-brand">{t.briefing.kicker}</p>
            <h2 id="briefing-title" className="h2">
              {t.briefing.title}
            </h2>
            <p className="body">{t.briefing.body}</p>
            <ul className="feature-list">
              {t.briefing.bullets.map((b) => (
                <li key={b}>
                  <CheckCircleIcon size={18} />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="feature-visual on-dawn">
            <BriefingCard t={t} />
          </div>
        </div>
      </section>

      {/* Mail intelligence */}
      <section className="section" style={{ paddingTop: 0 }} aria-labelledby="mail-title">
        <div className="container feature reverse">
          <div className="feature-copy">
            <p className="kicker kicker-brand">{t.mail.kicker}</p>
            <h2 id="mail-title" className="h2">
              {t.mail.title}
            </h2>
            <p className="lead">{t.mail.subtitle}</p>
            <p className="body">{t.mail.body}</p>
            <ul className="feature-list">
              {t.mail.bullets.map((b) => (
                <li key={b}>
                  <CheckCircleIcon size={18} />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="feature-visual on-surface">
            <MailScreen t={t} />
          </div>
        </div>
      </section>

      {/* Meeting prep */}
      <section className="section" style={{ paddingTop: 0 }} aria-labelledby="meeting-title">
        <div className="container feature">
          <div className="feature-copy">
            <p className="kicker kicker-brand">{t.meeting.kicker}</p>
            <h2 id="meeting-title" className="h2">
              {t.meeting.title}
            </h2>
            <p className="lead">{t.meeting.subtitle}</p>
            <p className="body">{t.meeting.body}</p>
          </div>
          <div className="feature-visual on-ink">
            <MeetingScreen t={t} />
          </div>
        </div>
      </section>

      {/* Smart planning */}
      <section className="section" style={{ paddingTop: 0 }} aria-labelledby="planning-title">
        <div className="container feature reverse">
          <div className="feature-copy">
            <p className="kicker kicker-brand">{t.planning.kicker}</p>
            <h2 id="planning-title" className="h2">
              {t.planning.title}
            </h2>
            <p className="body">{t.planning.body}</p>
          </div>
          <div className="feature-visual on-soft">
            <PlanScreen t={t} />
          </div>
        </div>
      </section>

      {/* AI memory */}
      <section className="section" style={{ paddingTop: 0 }} aria-labelledby="memory-title">
        <div className="container feature">
          <div className="feature-copy">
            <p className="kicker kicker-brand">{t.memory.kicker}</p>
            <h2 id="memory-title" className="h2">
              {t.memory.title}
            </h2>
            <p className="lead">{t.memory.subtitle}</p>
            <p className="body">{t.memory.body}</p>
          </div>
          <div className="feature-visual on-night">
            <AssistantScreen t={t} />
          </div>
        </div>
      </section>

      {/* Security */}
      <section
        id="security"
        className="section"
        style={{ paddingTop: 0 }}
        aria-labelledby="security-title"
      >
        <div className="container">
          <div className="section-head">
            <p className="kicker">{t.security.kicker}</p>
            <h2 id="security-title" className="h2">
              {t.security.title}
            </h2>
            <p className="lead">{t.security.subtitle}</p>
          </div>
          <div className="promises">
            {t.security.promises.map((p, i) => {
              const Icon = promiseIcons[i] ?? ShieldIcon;
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
          <div className="security-links">
            <Link href="/privacy">
              {t.security.links.privacy}
              <ArrowRightIcon size={16} />
            </Link>
            <Link href="/oauth">
              {t.security.links.oauth}
              <ArrowRightIcon size={16} />
            </Link>
            <Link href="/data-deletion">
              {t.security.links.deletion}
              <ArrowRightIcon size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section
        id="pricing"
        className="section"
        style={{ paddingTop: 0 }}
        aria-labelledby="pricing-title"
      >
        <div className="container">
          <div className="section-head center">
            <p className="kicker">{t.pricing.kicker}</p>
            <h2 id="pricing-title" className="h2">
              {t.pricing.title}
            </h2>
            <p className="lead">{t.pricing.subtitle}</p>
          </div>
          <PricingPlans t={t} />
          <PricingTable t={t} />
          <p className="caption pricing-note">{t.pricing.storeNote}</p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="section" style={{ paddingTop: 0 }} aria-labelledby="faq-title">
        <div className="container">
          <div className="section-head center">
            <p className="kicker">{t.faq.kicker}</p>
            <h2 id="faq-title" className="h2">
              {t.faq.title}
            </h2>
          </div>
          <Faq items={t.faq.items} />
        </div>
      </section>

      {/* Final CTA */}
      <section
        className="section"
        style={{ paddingTop: 0, paddingBottom: 0 }}
        aria-labelledby="final-title"
      >
        <div className="container">
          <div className="cta-band">
            <h2 id="final-title" className="h1">
              {t.finalCta.title}
            </h2>
            <p className="lead">{t.finalCta.body}</p>
            <div className="hero-actions">
              <Link href={ctaHref()} className="btn btn-on-dark btn-lg">
                {t.finalCta.cta}
              </Link>
            </div>
            <p className="caption">{t.finalCta.note}</p>
          </div>
        </div>
      </section>

      {/* Download */}
      <section id="download" className="download" aria-labelledby="download-title">
        <div className="container">
          <div className="download-card">
            <div>
              <p className="kicker">{t.download.kicker}</p>
              <h2 id="download-title" className="h2">
                {t.download.title}
              </h2>
              <p className="secondary" style={{ fontSize: 15, lineHeight: '22px', maxWidth: 560 }}>
                {hasStoreLinks() ? t.download.bodyStores : t.download.bodyBeta}
              </p>
            </div>
            <StoreBadges t={t} compact />
          </div>
        </div>
      </section>
    </>
  );
}
