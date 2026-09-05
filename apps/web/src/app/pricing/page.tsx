import { type Metadata } from 'next';
import { Faq } from '@/components/Faq';
import { GiftIcon } from '@/components/Icons';
import { PricingPlans, PricingTable } from '@/components/Pricing';
import { getDictionary } from '@/i18n';
import { getLang, getPageContext, type SearchParams } from '@/i18n/server';
import { pageMetadata } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  const t = getDictionary(lang);
  return pageMetadata({
    lang,
    path: '/pricing',
    title: t.pricingPage.title,
    description: t.pricingPage.description,
  });
}

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { t } = await getPageContext('/pricing', await searchParams);
  const pricingFaq = t.faq.items.filter((item) => /plan|deneme|trial|free/i.test(item.q));

  return (
    <div className="page">
      <div className="container">
        <header
          className="page-head"
          style={{ marginLeft: 'auto', marginRight: 'auto', textAlign: 'center' }}
        >
          <p className="kicker">{t.pricing.kicker}</p>
          <h1 className="h1">{t.pricing.title}</h1>
          <p className="lead">{t.pricing.subtitle}</p>
        </header>

        <PricingPlans t={t} />
        <PricingTable t={t} />
        <p className="caption pricing-note">{t.pricing.storeNote}</p>

        <section className="page-section" aria-labelledby="billing-title">
          <h2 id="billing-title" className="h2">
            {t.pricingPage.billingTitle}
          </h2>
          <ul className="bullets">
            {t.pricingPage.billing.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </section>

        <section className="page-section" aria-labelledby="referral-title">
          <div className="card promise">
            <span className="promise-icon">
              <GiftIcon size={20} />
            </span>
            <div>
              <h2 id="referral-title" className="h4">
                {t.pricingPage.referralTitle}
              </h2>
              <p className="secondary" style={{ fontSize: 15, lineHeight: '22px' }}>
                {t.pricingPage.referralBody}
              </p>
            </div>
          </div>
        </section>

        {pricingFaq.length > 0 && (
          <section className="page-section" aria-labelledby="pricing-faq-title">
            <h2 id="pricing-faq-title" className="h2">
              {t.pricingPage.faqTitle}
            </h2>
            <Faq items={pricingFaq} />
          </section>
        )}
      </div>
    </div>
  );
}
