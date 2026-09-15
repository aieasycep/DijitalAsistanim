import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { localeTag, localeUpperCase, plainTextChildren } from './text';

describe('localeUpperCase', () => {
  it('keeps the dotted İ for Turkish (the native device-locale transform would produce a dotless I)', () => {
    expect(localeUpperCase('Senin beklediklerin', 'tr')).toBe('SENİN BEKLEDİKLERİN');
    expect(localeUpperCase('Son iletişim', 'tr')).toBe('SON İLETİŞİM');
    expect(localeUpperCase('Telefon Bildirimleri', 'tr')).toBe('TELEFON BİLDİRİMLERİ');
    expect(localeUpperCase('3 kişi', 'tr')).toBe('3 KİŞİ');
  });

  it('maps the dotless ı to I and keeps the other Turkish letters', () => {
    expect(localeUpperCase('ılık çağ güneş öğle', 'tr')).toBe('ILIK ÇAĞ GÜNEŞ ÖĞLE');
  });

  it('uses plain Latin casing for English', () => {
    expect(localeUpperCase('priorities', 'en')).toBe('PRIORITIES');
    expect(localeUpperCase('brief is ready', 'en')).toBe('BRIEF IS READY');
  });

  it('does not depend on engine locale data for the Turkish i', () => {
    const original = String.prototype.toLocaleUpperCase;
    // Simulate a runtime whose toLocaleUpperCase ignores the locale argument.
    String.prototype.toLocaleUpperCase = function (this: string) {
      return String.prototype.toUpperCase.call(this);
    };
    try {
      expect(localeUpperCase('iletişim', 'tr')).toBe('İLETİŞİM');
    } finally {
      String.prototype.toLocaleUpperCase = original;
    }
  });

  it('resolves BCP-47 tags', () => {
    expect(localeTag('tr')).toBe('tr-TR');
    expect(localeTag('en')).toBe('en-US');
  });
});

describe('plainTextChildren', () => {
  it('joins string and number children', () => {
    expect(plainTextChildren('kicker')).toBe('kicker');
    expect(plainTextChildren(['Son ', 3, ' iletişim'])).toBe('Son 3 iletişim');
    expect(plainTextChildren(['a', null, false, undefined, 'b'])).toBe('ab');
    expect(plainTextChildren(0)).toBe('0');
  });

  it('returns null for empty children or nested elements', () => {
    expect(plainTextChildren(null)).toBeNull();
    expect(plainTextChildren(undefined)).toBeNull();
    expect(plainTextChildren(['a', createElement('b', null, 'bold')])).toBeNull();
  });
});
