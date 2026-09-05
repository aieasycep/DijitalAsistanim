import { describe, expect, it } from 'vitest';
import {
  dativeSuffix,
  formatDayHeader,
  formatDayKicker,
  formatDurationLong,
  formatMoney,
  formatRelativeLabel,
  formatRemaining,
  formatTime,
  greetingFor,
  toLocalDateKey,
  type FormatCtx,
} from './format';
import { resolveLocale } from './index';

const now = new Date('2026-09-05T06:30:00.000Z'); // 09:30 Istanbul
const ctx: FormatCtx = { locale: 'tr', timezone: 'Europe/Istanbul', now };

describe('formatting (tr, Europe/Istanbul)', () => {
  it('formats 24h times and day headers', () => {
    expect(formatTime('2026-09-05T05:42:00.000Z', ctx)).toBe('08:42');
    expect(formatDayHeader(now, ctx)).toBe('5 Eylül Cumartesi');
    expect(formatDayKicker(now, ctx)).toBe('5 EYLÜL CUMARTESİ');
  });

  it('formats relative labels', () => {
    expect(formatRelativeLabel('2026-09-05T05:42:00.000Z', ctx)).toBe('08:42');
    expect(formatRelativeLabel('2026-09-06T09:00:00.000Z', ctx)).toBe('Yarın 12:00');
    expect(formatRelativeLabel('2026-09-04T12:40:00.000Z', ctx)).toBe('Dün 15:40');
    expect(formatRelativeLabel('2026-09-02T12:40:00.000Z', ctx)).toBe('2 Eyl');
  });

  it('formats remaining time and money', () => {
    expect(formatRemaining('2026-09-05T10:30:00.000Z', ctx)).toBe('4 sa kaldı');
    expect(formatMoney(1842, 'TRY', 'tr')).toBe('1.842 TL');
    expect(formatDurationLong(168, 'tr')).toBe('2 saat 48 dakika');
  });

  it('handles timezone day boundaries', () => {
    // 23:30 UTC on Sep 4 is 02:30 on Sep 5 in Istanbul
    expect(toLocalDateKey('2026-09-04T23:30:00.000Z', ctx)).toBe('2026-09-05');
  });

  it('picks greeting by local hour', () => {
    expect(greetingFor(ctx)).toBe('morning');
    expect(greetingFor({ ...ctx, now: new Date('2026-09-05T17:30:00.000Z') })).toBe('evening');
  });

  it('applies Turkish dative suffix', () => {
    expect(dativeSuffix('Mehmet')).toBe("Mehmet'e");
    expect(dativeSuffix('Selin')).toBe("Selin'e");
    expect(dativeSuffix('Ahmet')).toBe("Ahmet'e");
    expect(dativeSuffix('Ayşe')).toBe("Ayşe'ye");
    expect(dativeSuffix('Burak')).toBe("Burak'a");
  });

  it('resolves device locale', () => {
    expect(resolveLocale('en-US')).toBe('en');
    expect(resolveLocale('tr-TR')).toBe('tr');
    expect(resolveLocale('de-DE')).toBe('tr');
  });
});
