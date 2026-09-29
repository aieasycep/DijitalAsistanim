jest.mock('expo-application', () => ({
  nativeApplicationVersion: '1.2.3',
  nativeBuildVersion: '45',
  applicationId: 'com.dijitalasistan.app',
}));

import { appInfo, appVersionLabel, supportEmail, supportMailto, webHost, webLinks } from '../links';
import { isValidHHmm, parseHHmm, toDate, toHHmm } from '../time';
import {
  formatOffset,
  matchesTimezone,
  timezoneCity,
  timezoneLabel,
  timezoneOffsetMinutes,
  timezoneOptions,
  timezoneRegion,
} from '../timezones';
import { isoToWeeklyDay, toggleQuietDay, weekdayLabel, weeklyDayToIso } from '../weekdays';

const AT = new Date('2026-09-05T06:41:00Z');

describe('time helpers', () => {
  it('parses and formats HH:mm', () => {
    expect(parseHHmm('07:30')).toEqual({ hour: 7, minute: 30 });
    expect(parseHHmm('24:00')).toBeNull();
    expect(parseHHmm('7:5')).toBeNull();
    expect(isValidHHmm('23:59')).toBe(true);
    expect(toHHmm(new Date(2026, 0, 1, 7, 5))).toBe('07:05');
    const d = toDate('09:15', new Date(2026, 0, 1));
    expect([d.getHours(), d.getMinutes()]).toEqual([9, 15]);
    expect(toDate('garbage').getHours()).toBe(8);
  });
});

describe('weekday helpers', () => {
  it('labels ISO weekdays per locale and converts weekly-day encodings', () => {
    expect(weekdayLabel(1, 'tr')).toBe('Pzt');
    expect(weekdayLabel(7, 'en', 'long')).toBe('Sunday');
    expect(weeklyDayToIso(0)).toBe(7);
    expect(weeklyDayToIso(3)).toBe(3);
    expect(isoToWeeklyDay(7)).toBe(0);
    expect(isoToWeeklyDay(5)).toBe(5);
  });

  it('toggles quiet days, keeping them sorted and unique', () => {
    expect(toggleQuietDay([], 3)).toEqual([3]);
    expect(toggleQuietDay([3, 1], 3)).toEqual([1]);
    expect(toggleQuietDay([6, 6, 9], 1)).toEqual([1, 6]);
  });
});

describe('timezone helpers', () => {
  it('computes DST-aware offsets through Intl', () => {
    expect(timezoneOffsetMinutes('Europe/Istanbul', AT)).toBe(180);
    expect(timezoneOffsetMinutes('America/New_York', AT)).toBe(-240);
    expect(timezoneOffsetMinutes('Asia/Kolkata', AT)).toBe(330);
    expect(timezoneOffsetMinutes('UTC', AT)).toBe(0);
    expect(timezoneOffsetMinutes('Mars/Olympus', AT)).toBeNull();
  });

  it('formats offsets and names', () => {
    expect(formatOffset(180)).toBe('GMT+3');
    expect(formatOffset(-270)).toBe('GMT-4:30');
    expect(formatOffset(0)).toBe('GMT');
    expect(formatOffset(null)).toBe('GMT');
    expect(timezoneCity('America/Argentina/Buenos_Aires')).toBe('Buenos Aires');
    expect(timezoneRegion('America/Argentina/Buenos_Aires')).toBe('America');
    expect(timezoneRegion('UTC')).toBe('');
    expect(timezoneLabel('Europe/Istanbul', AT)).toBe('Istanbul · GMT+3');
  });

  it('orders options: current, device, then by offset; search covers every zone', () => {
    const options = timezoneOptions({
      current: 'Asia/Tokyo',
      device: 'Europe/Istanbul',
      at: AT,
    });
    expect(options[0]?.id).toBe('Asia/Tokyo');
    expect(options[0]?.isCurrent).toBe(true);
    expect(options[1]?.id).toBe('Europe/Istanbul');
    expect(options[1]?.isDevice).toBe(true);
    const rest = options.slice(2);
    for (let i = 1; i < rest.length; i += 1) {
      const prev = rest[i - 1];
      const next = rest[i];
      expect((prev?.offsetMinutes ?? 0) <= (next?.offsetMinutes ?? 0)).toBe(true);
    }
    expect(matchesTimezone('Europe/London', 'lond')).toBe(true);
    expect(matchesTimezone('America/Argentina/Buenos_Aires', 'buenos aires')).toBe(true);
    const searched = timezoneOptions({
      current: 'Europe/Istanbul',
      device: 'Europe/Istanbul',
      query: 'Reykjavik',
      at: AT,
    });
    expect(searched.some((o) => o.id === 'Atlantic/Reykjavik')).toBe(true);
  });
});

describe('links & app info', () => {
  it('derives web links, support address and version label', () => {
    expect(webHost()).toBe('dijitalasistan.app');
    expect(webLinks.docs).toBe('https://dijitalasistan.app/help');
    expect(webLinks.status).toBe('https://dijitalasistan.app/status');
    expect(supportEmail).toBe('destek@dijitalasistan.app');
    const mailto = supportMailto('Konu · Test', 'Sürüm: 1.2.3');
    expect(mailto.startsWith('mailto:destek@dijitalasistan.app?subject=')).toBe(true);
    expect(mailto).toContain(encodeURIComponent('Konu · Test'));
    expect(appInfo()).toEqual({ version: '1.2.3', build: '45', platform: 'ios' });
    expect(appVersionLabel()).toBe('1.2.3 (45)');
  });
});
