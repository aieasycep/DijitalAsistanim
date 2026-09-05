import { describe, expect, it } from 'vitest';
import { computeReminderOptions, computeSmartReminder, validateCustomReminder } from './index';

const now = '2026-09-04T05:42:00.000Z'; // Friday 08:42 Istanbul
const tz = 'Europe/Istanbul';

describe('reminders · computeSmartReminder', () => {
  it('prefers 25 minutes before a meeting, else the closest free 15-minute slot before it', () => {
    const meeting = '2026-09-04T11:00:00.000Z'; // 14:00 local
    const free = computeSmartReminder({ anchorAt: meeting, isMeeting: true, now, timezone: tz, busy: [] });
    expect(free).toEqual({ at: '2026-09-04T10:35:00.000Z', reason: 'Takviminde 13:35 boş; toplantından önce.' });

    const busy = [
      { startAt: '2026-09-04T08:30:00.000Z', endAt: '2026-09-04T09:10:00.000Z' }, // 11:30–12:10
      { startAt: '2026-09-04T09:25:00.000Z', endAt: '2026-09-04T10:50:00.000Z' }, // 12:25–13:50
    ];
    const packed = computeSmartReminder({ anchorAt: meeting, isMeeting: true, now, timezone: tz, busy });
    expect(packed).toEqual({ at: '2026-09-04T09:10:00.000Z', reason: 'Takviminde 12:10 boş; toplantından önce.' });
    const en = computeSmartReminder({ anchorAt: meeting, isMeeting: true, now, timezone: tz, busy, locale: 'en' });
    expect(en?.reason).toBe('Your calendar is free at 12:10; before the meeting.');
    const custom = computeSmartReminder({ anchorAt: meeting, isMeeting: true, now, timezone: tz, busy: [], meetingLeadMinutes: 40 });
    expect(custom?.at).toBe('2026-09-04T10:20:00.000Z');
  });

  it('for deadlines picks the earliest working-hours slot at least 10 minutes from now', () => {
    const deadline = '2026-09-04T14:00:00.000Z'; // 17:00 local
    expect(computeSmartReminder({ anchorAt: deadline, isMeeting: false, now, timezone: tz, busy: [] })).toEqual({
      at: '2026-09-04T06:00:00.000Z',
      reason: 'Takviminde 09:00 boş; son tarihten önce.',
    });
    const later = computeSmartReminder({ anchorAt: deadline, isMeeting: false, now: '2026-09-04T07:03:00.000Z', timezone: tz, busy: [{ startAt: '2026-09-04T07:00:00.000Z', endAt: '2026-09-04T08:00:00.000Z' }] });
    expect(later?.at).toBe('2026-09-04T08:00:00.000Z');
  });

  it('for far deadlines searches the day before; without a deadline the next 48 hours', () => {
    const monday = computeSmartReminder({ anchorAt: '2026-09-07T14:00:00.000Z', isMeeting: false, now, timezone: tz, busy: [] });
    expect(monday).toEqual({ at: '2026-09-06T14:00:00.000Z', reason: 'Takviminde Pazar 17:00 boş; son tarihten önce.' });
    const evening = computeSmartReminder({ anchorAt: null, isMeeting: false, now: '2026-09-04T18:00:00.000Z', timezone: tz, busy: [] });
    expect(evening).toEqual({ at: '2026-09-05T06:00:00.000Z', reason: 'Takviminde yarın 09:00 boş.' });
    expect(computeSmartReminder({ anchorAt: null, isMeeting: false, now: '2026-09-04T18:00:00.000Z', timezone: tz, busy: [], locale: 'en' })?.reason).toBe('Your calendar is free tomorrow at 09:00.');
  });

  it('respects quiet hours and returns null when there is no room', () => {
    const quiet = { enabled: true, start: '09:00', end: '10:00' };
    const r = computeSmartReminder({ anchorAt: '2026-09-04T14:00:00.000Z', isMeeting: false, now, timezone: tz, busy: [], quietHours: quiet });
    expect(r?.at).toBe('2026-09-04T07:00:00.000Z');
    expect(computeSmartReminder({ anchorAt: '2026-09-04T06:02:00.000Z', isMeeting: true, now, timezone: tz, busy: [] })).toBeNull();
    expect(computeSmartReminder({ anchorAt: '2026-09-03T06:02:00.000Z', isMeeting: false, now, timezone: tz, busy: [] })?.at).toBe('2026-09-04T06:00:00.000Z');
    expect(computeSmartReminder({ anchorAt: 'not-a-date', isMeeting: false, now: 'nope', timezone: tz, busy: [] })).toBeNull();
  });
});

describe('reminders · computeReminderOptions', () => {
  it('meeting today: relative options, smart and custom; evening/tomorrow dropped after the target', () => {
    const r = computeReminderOptions({
      target: { startAt: '2026-09-04T11:00:00.000Z', isMeeting: true },
      now,
      timezone: tz,
      busy: [
        { startAt: '2026-09-04T08:30:00.000Z', endAt: '2026-09-04T09:10:00.000Z' },
        { startAt: '2026-09-04T09:25:00.000Z', endAt: '2026-09-04T10:50:00.000Z' },
      ],
    });
    expect(r.options).toEqual([
      { option: 'before_30m', at: '2026-09-04T10:30:00.000Z', label: '30 dakika önce', reason: null },
      { option: 'before_1h', at: '2026-09-04T10:00:00.000Z', label: '1 saat önce', reason: null },
      { option: 'smart', at: '2026-09-04T09:10:00.000Z', label: 'Akıllı öneri · 12:10', reason: 'Takviminde 12:10 boş; toplantından önce.' },
      { option: 'custom', at: '2026-09-04T11:00:00.000Z', label: 'Özel zaman', reason: null },
    ]);
    expect(r.smart).toEqual({ at: '2026-09-04T09:10:00.000Z', reason: 'Takviminde 12:10 boş; toplantından önce.' });
  });

  it('no target: evening 19:00, tomorrow 09:10, smart and custom = now + 1h (English)', () => {
    const r = computeReminderOptions({ target: { isMeeting: false }, now, timezone: tz, busy: [], locale: 'en' });
    expect(r.options.map((o) => o.option)).toEqual(['this_evening', 'tomorrow_morning', 'smart', 'custom']);
    expect(r.options[0]).toEqual({ option: 'this_evening', at: '2026-09-04T16:00:00.000Z', label: 'This evening at 19:00', reason: null });
    expect(r.options[1]).toEqual({ option: 'tomorrow_morning', at: '2026-09-05T06:10:00.000Z', label: 'Tomorrow morning at 09:10', reason: null });
    expect(r.options[2]).toMatchObject({ option: 'smart', at: '2026-09-04T06:00:00.000Z', label: 'Smart · 09:00', reason: 'Your calendar is free at 09:00.' });
    expect(r.options[3]).toEqual({ option: 'custom', at: '2026-09-04T06:42:00.000Z', label: 'Custom time', reason: null });
  });

  it('this evening falls back to 20:30, then disappears; past deadlines keep the day options', () => {
    const late = computeReminderOptions({ target: { dueAt: '2026-09-03T14:00:00.000Z', isMeeting: false }, now: '2026-09-04T16:30:00.000Z', timezone: tz, busy: [] });
    expect(late.options.find((o) => o.option === 'this_evening')).toMatchObject({ at: '2026-09-04T17:30:00.000Z', label: 'Bu akşam 20:30' });
    expect(late.options.find((o) => o.option === 'tomorrow_morning')).toMatchObject({ at: '2026-09-05T06:10:00.000Z', label: 'Yarın sabah 09:10' });
    expect(late.options.some((o) => o.option === 'before_30m')).toBe(false);
    expect(late.options.find((o) => o.option === 'custom')?.at).toBe('2026-09-04T17:30:00.000Z');
    const night = computeReminderOptions({ target: { isMeeting: false }, now: '2026-09-04T18:00:00.000Z', timezone: tz, busy: [] });
    expect(night.options.map((o) => o.option)).toEqual(['tomorrow_morning', 'smart', 'custom']);
  });

  it('shifts fixed options out of quiet hours and explains the shift', () => {
    const evening = computeReminderOptions({ target: { isMeeting: false }, now, timezone: tz, busy: [], quietHours: { enabled: true, start: '18:00', end: '21:00' } });
    expect(evening.options.find((o) => o.option === 'this_evening')).toEqual({
      option: 'this_evening',
      at: '2026-09-04T18:00:00.000Z',
      label: 'Bu akşam 21:00',
      reason: 'Sessiz saatler nedeniyle 21:00 olarak ayarlandı.',
    });
    const morning = computeReminderOptions({ target: { isMeeting: false }, now, timezone: tz, busy: [], quietHours: { enabled: true, start: '09:00', end: '10:00' } });
    expect(morning.options.find((o) => o.option === 'tomorrow_morning')).toMatchObject({ at: '2026-09-05T07:00:00.000Z', label: 'Yarın sabah 10:00' });
    const overnight = computeReminderOptions({ target: { isMeeting: false }, now, timezone: tz, busy: [], quietHours: { enabled: true, start: '19:00', end: '07:00' } });
    expect(overnight.options.some((o) => o.option === 'this_evening')).toBe(false);
  });

  it('a meeting starting in 20 minutes leaves only the custom option', () => {
    const r = computeReminderOptions({ target: { startAt: '2026-09-04T06:02:00.000Z', isMeeting: true }, now, timezone: tz, busy: [] });
    expect(r.options).toEqual([{ option: 'custom', at: '2026-09-04T06:02:00.000Z', label: 'Özel zaman', reason: null }]);
    expect(r.smart).toBeNull();
  });
});

describe('reminders · validateCustomReminder', () => {
  it('accepts future instants within a year and rejects the rest with messages', () => {
    expect(validateCustomReminder('2026-09-04T07:00:00+03:00', now)).toEqual({ ok: false, reason: 'past', message: 'Hatırlatma zamanı gelecekte olmalı.' });
    expect(validateCustomReminder('2026-09-04T12:00:00+03:00', now)).toEqual({ ok: true, at: '2026-09-04T09:00:00.000Z' });
    expect(validateCustomReminder(now, now)).toEqual({ ok: false, reason: 'past', message: 'Hatırlatma zamanı gelecekte olmalı.' });
    expect(validateCustomReminder('yarın', now, { locale: 'en' })).toEqual({ ok: false, reason: 'invalid', message: 'Pick a valid date and time.' });
    expect(validateCustomReminder('2027-09-05T05:42:00.000Z', now)).toEqual({ ok: false, reason: 'too_far', message: 'Hatırlatma en fazla bir yıl sonrası için kurulabilir.' });
    expect(validateCustomReminder('2026-09-20T05:42:00.000Z', now, { maxDays: 7 })).toMatchObject({ ok: false, reason: 'too_far' });
  });
});
