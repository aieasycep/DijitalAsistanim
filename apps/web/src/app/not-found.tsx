import Link from 'next/link';
import { getDictionary } from '@/i18n';
import { getLang } from '@/i18n/server';

export default async function NotFound() {
  const lang = await getLang();
  const t = getDictionary(lang);
  return (
    <div className="page">
      <div className="container applink">
        <p className="kicker">404</p>
        <h1 className="h1">{t.notFound.title}</h1>
        <p className="lead">{t.notFound.body}</p>
        <div className="hero-actions">
          <Link href="/" className="btn btn-primary">
            {t.notFound.cta}
          </Link>
        </div>
      </div>
    </div>
  );
}
