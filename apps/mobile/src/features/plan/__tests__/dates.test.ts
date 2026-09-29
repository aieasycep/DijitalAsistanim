import {
  addDaysKey,
  isoAtLocal,
  minutesBetween,
  weekKeys,
  weekRangeLabel,
  weekStartOf,
  weekdayShort,
} from '../dates';

describe('plan date helpers', () => {
  it('finds Monday of the week for any weekday', () => {
    expect(weekStartOf('2026-09-05')).toBe('2026-08-31'); // Saturday → Monday
    expect(weekStartOf('2026-09-06')).toBe('2026-08-31'); // Sunday → same Monday
    expect(weekStartOf('2026-09-07')).toBe('2026-09-07'); // Monday
  });

  it('adds days across month boundaries', () => {
    expect(addDaysKey('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDaysKey('2026-09-01', -1)).toBe('2026-08-31');
    expect(weekKeys('2026-08-31')).toHaveLength(7);
    expect(weekKeys('2026-08-31')[6]).toBe('2026-09-06');
  });

  it('formats weekday and range labels per locale', () => {
    expect(weekdayShort('2026-09-05', 'tr').toLowerCase()).toContain('cmt');
    expect(weekdayShort('2026-09-05', 'en')).toBe('Sat');
    expect(weekRangeLabel('2026-08-31', 'tr')).toContain('–');
  });

  it('computes local wall-clock instants in the user timezone', () => {
    const ctx = {
      locale: 'tr' as const,
      timezone: 'Europe/Istanbul',
      now: new Date('2026-09-05T06:41:00Z'),
    };
    const iso = isoAtLocal(ctx, 1, 9);
    expect(iso).toBe('2026-09-06T06:00:00.000Z'); // 09:00 Istanbul (UTC+3)
    expect(minutesBetween('2026-09-05T10:00:00Z', '2026-09-05T11:30:00Z')).toBe(90);
  });
});
