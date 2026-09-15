import { type Dictionary, type LegalDoc } from '@/i18n';
import { SITE } from '@/lib/env';

function slug(index: number): string {
  return `s-${index + 1}`;
}

export function LegalDocument({ doc, t }: { doc: LegalDoc; t: Dictionary }) {
  return (
    <article className="prose">
      <header className="prose-header">
        <h1>{doc.title}</h1>
        <p className="lead">{doc.intro}</p>
        <p className="caption">
          {t.legal.updatedPrefix}: {doc.updatedLabel}
        </p>
      </header>
      <nav className="toc" aria-label={t.legal.tocTitle}>
        <h2 className="kicker">{t.legal.tocTitle}</h2>
        <ol>
          {doc.sections.map((s, i) => (
            <li key={s.title}>
              <a href={`#${slug(i)}`}>{s.title}</a>
            </li>
          ))}
        </ol>
      </nav>
      {doc.sections.map((s, i) => (
        <section key={s.title} id={slug(i)}>
          <h2>{s.title}</h2>
          {s.paragraphs?.map((p) => (
            <p key={p}>{p}</p>
          ))}
          {s.bullets && (
            <ul>
              {s.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
          {s.after?.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </section>
      ))}
      <section id="contact">
        <h2>{t.legal.contactTitle}</h2>
        <p>
          <a href={`mailto:${SITE.privacyEmail}`}>{SITE.privacyEmail}</a> ·{' '}
          <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>
        </p>
      </section>
    </article>
  );
}
