'use client';

import { useEffect } from 'react';

const COPY = {
  tr: {
    title: 'Bir şeyler ters gitti.',
    body: 'Sayfa yüklenirken beklenmedik bir hata oluştu. Tekrar deneyebilir ya da ana sayfaya dönebilirsin.',
    retry: 'Tekrar dene',
    home: 'Ana sayfaya dön',
  },
  en: {
    title: 'Something went wrong.',
    body: 'An unexpected error occurred while loading the page. You can try again or go back to the home page.',
    retry: 'Try again',
    home: 'Back to home',
  },
} as const;

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
  const lang =
    typeof document !== 'undefined' && document.documentElement.lang === 'en' ? 'en' : 'tr';
  const t = COPY[lang];
  return (
    <div className="page">
      <div className="container applink">
        <p className="kicker">{lang === 'en' ? 'Error' : 'Hata'}</p>
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
