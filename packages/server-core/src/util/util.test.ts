import { describe, expect, it } from 'vitest';
import {
  emailDomain,
  localDateKey,
  localHour,
  normalizeText,
  stripQuotedHistory,
  truncate,
  zonedTimeToUtc,
} from './index';

describe('util', () => {
  it('normalizes html and whitespace', () => {
    expect(normalizeText('<p>Merhaba&nbsp;<b>Yunus</b></p>\n\n\n\nSelam')).toBe(
      'Merhaba Yunus\n\nSelam',
    );
  });
  it('strips quoted history (tr + en)', () => {
    expect(
      stripQuotedHistory('Tamam, gönderirim.\n\nOn Fri, Sep 4 Ahmet wrote:\n> eski mesaj'),
    ).toBe('Tamam, gönderirim.');
    expect(stripQuotedHistory('Olur.\n\n4 Eyl 2026 tarihinde Ahmet şunu yazdı:\n> eski')).toBe(
      'Olur.',
    );
  });
  it('handles timezones', () => {
    expect(localDateKey('2026-09-04T23:30:00.000Z', 'Europe/Istanbul')).toBe('2026-09-05');
    expect(localHour('2026-09-05T05:00:00.000Z', 'Europe/Istanbul')).toBe(8);
    expect(zonedTimeToUtc('2026-09-05', '07:30', 'Europe/Istanbul')).toBe(
      '2026-09-05T04:30:00.000Z',
    );
    expect(zonedTimeToUtc('2026-03-29', '02:30', 'Europe/Berlin')).toBe('2026-03-29T01:30:00.000Z');
  });
  it('misc', () => {
    expect(truncate('abcdefghij', 5)).toBe('abcd…');
    expect(emailDomain('Ahmet@Firma.COM')).toBe('firma.com');
  });
});
