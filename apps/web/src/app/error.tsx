'use client';

import { useEffect } from 'react';
import { DEFAULT_LANG, getDictionary, isLang, type Lang } from '@/i18n';

/** The language the layout rendered into `<html lang>`; error boundaries render on the client only. */
function documentLang(): Lang {
  if (typeof document === 'undefined') return DEFAULT_LANG;
  const lang = document.documentElement.lang;
  return isLang(lang) ? lang : DEFAULT_LANG;
}

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const t = getDictionary(documentLang()).errorPage;
  return (
    <div className="page">
      <div className="container applink">
        <p className="kicker">{t.kicker}</p>
        <h1 className="h1">{t.title}</h1>
        <p className="lead">{t.body}</p>
        <div className="hero-actions">
          <button type="button" className="btn btn-primary" onClick={reset}>
            {t.retry}
          </button>
          <a href="/" className="btn btn-ghost">
            {t.home}
          </a>
        </div>
      </div>
    </div>
  );
}
