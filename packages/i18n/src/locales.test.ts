import { describe, expect, it } from 'vitest';
import tr from './locales/tr.json';
import en from './locales/en.json';
import { createI18n } from './index';

function flatten(obj: unknown, prefix = ''): string[] {
  if (Array.isArray(obj)) return [prefix];
  if (obj && typeof obj === 'object') {
    return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k));
  }
  return [prefix];
}

describe('locales', () => {
  it('en covers every tr key', () => {
    const trKeys = new Set(flatten(tr));
    const enKeys = new Set(flatten(en));
    const missing = [...trKeys].filter((k) => !enKeys.has(k));
    expect(missing).toEqual([]);
    const extra = [...enKeys].filter((k) => !trKeys.has(k));
    expect(extra).toEqual([]);
  });

  it('interpolates Turkish strings', () => {
    const i18n = createI18n('tr');
    expect(i18n.t('greeting.morning', { name: 'Yunus' })).toBe('Günaydın, Yunus');
    expect(i18n.t('today.headline', { count: 5 })).toBe('Bugün bilmen gereken 5 şey var.');
    expect(i18n.t('common.sourceLine', { label: 'Gmail', person: 'Ahmet Yılmaz', time: '08:42' })).toBe('Gmail · Ahmet Yılmaz · 08:42');
  });

  it('switches to English', () => {
    const i18n = createI18n('en');
    expect(i18n.t('tabs.today')).toBe('Today');
  });
});
