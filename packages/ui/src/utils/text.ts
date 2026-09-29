import { Children, type ReactNode } from 'react';
import type { Locale } from '@da/domain';

/** BCP-47 tag for a supported UI locale. */
export function localeTag(locale: Locale): 'tr-TR' | 'en-US' {
  return locale === 'tr' ? 'tr-TR' : 'en-US';
}

/**
 * Locale-aware upper-casing. React Native applies `textTransform: 'uppercase'` natively in the *device*
 * locale, so Turkish UI text on a non-Turkish device loses its dots ("iletişim" → "ILETIŞIM" instead of
 * "İLETİŞİM"). The Turkish dotted/dotless i pair is mapped explicitly before `toLocaleUpperCase`, so the
 * result is right even on a JS engine that ships without locale data.
 */
export function localeUpperCase(text: string, locale: Locale): string {
  const prepared = locale === 'tr' ? text.replace(/i/g, 'İ').replace(/ı/g, 'I') : text;
  return prepared.toLocaleUpperCase(localeTag(locale));
}

/**
 * Concatenates `children` when every child is a string or number (after React's flattening); `null`
 * otherwise, so nested elements keep their own rendering and the native text transform.
 */
export function plainTextChildren(children: ReactNode): string | null {
  const parts = Children.toArray(children);
  if (parts.length === 0) return null;
  let text = '';
  for (const part of parts) {
    if (typeof part !== 'string' && typeof part !== 'number') return null;
    text += String(part);
  }
  return text;
}
