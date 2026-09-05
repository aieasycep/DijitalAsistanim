import { describe, expect, it } from 'vitest';
import {
  TIME_SAVED_WEEKLY_CAP_MINUTES,
  TIME_SAVED_WEIGHTS,
  buildWeeklyMetrics,
  computeTimeSavedBreakdown,
  computeTimeSavedMinutes,
  formatTimeSaved,
} from './index';

describe('timeSaved · computeTimeSavedMinutes', () => {
  it('applies the documented weights', () => {
    expect(TIME_SAVED_WEIGHTS).toEqual({
      unreadLowPriorityMails: 0.25,
      importantSummariesRead: 1.5,
      prepNotesGenerated: 12,
      followUpDraftsUsed: 6,
      repliesDrafted: 4,
      deadlinesCaught: 5,
    });
    const minutes = computeTimeSavedMinutes({
      unreadLowPriorityMails: 40,
      importantSummariesRead: 10,
      prepNotesGenerated: 3,
      followUpDraftsUsed: 2,
      repliesDrafted: 5,
      deadlinesCaught: 2,
    });
    expect(minutes).toBe(10 + 15 + 36 + 12 + 20 + 10);
  });

  it('ignores missing, negative and non-finite inputs', () => {
    expect(computeTimeSavedMinutes({})).toBe(0);
    expect(
      computeTimeSavedMinutes({
        prepNotesGenerated: -4,
        repliesDrafted: Number.NaN,
        deadlinesCaught: 2,
      }),
    ).toBe(10);
  });

  it('caps at 20 hours per week and scales the breakdown to match', () => {
    expect(TIME_SAVED_WEEKLY_CAP_MINUTES).toBe(1200);
    expect(computeTimeSavedMinutes({ prepNotesGenerated: 200 })).toBe(1200);
    const b = computeTimeSavedBreakdown({
      prepNotesGenerated: 100,
      repliesDrafted: 300,
      unreadLowPriorityMails: 400,
    });
    expect(b.total).toBe(1200);
    expect(b.unreadMails + b.prepNotes + b.followUpDrafts).toBe(1200);
    expect(b.prepNotes).toBeGreaterThan(b.unreadMails);
    expect(computeTimeSavedMinutes({ prepNotesGenerated: 200 }, { capMinutes: 600 })).toBe(600);
  });

  it('groups the breakdown into mail / prep / drafts buckets', () => {
    const b = computeTimeSavedBreakdown({
      unreadLowPriorityMails: 40,
      importantSummariesRead: 10,
      deadlinesCaught: 2,
      prepNotesGenerated: 3,
      followUpDraftsUsed: 2,
      repliesDrafted: 5,
    });
    expect(b).toEqual({ unreadMails: 35, prepNotes: 36, followUpDrafts: 32, total: 103 });
  });
});

describe('timeSaved · formatTimeSaved', () => {
  it('formats Turkish naturally', () => {
    expect(formatTimeSaved(168)).toBe('2 saat 48 dakika');
    expect(formatTimeSaved(45)).toBe('45 dakika');
    expect(formatTimeSaved(180)).toBe('3 saat');
    expect(formatTimeSaved(0)).toBe('0 dakika');
    expect(formatTimeSaved(2.6)).toBe('3 dakika');
    expect(formatTimeSaved(-5)).toBe('0 dakika');
  });
  it('formats English with plurals', () => {
    expect(formatTimeSaved(61, 'en')).toBe('1 hour 1 minute');
    expect(formatTimeSaved(120, 'en')).toBe('2 hours');
    expect(formatTimeSaved(0, 'en')).toBe('0 minutes');
    expect(formatTimeSaved(168, 'en')).toBe('2 hours 48 minutes');
  });
});

describe('timeSaved · buildWeeklyMetrics', () => {
  const raw = {
    weekStart: '2026-08-31',
    weekEnd: '2026-09-06',
    analyzedEmails: 312,
    importantItems: 18,
    followUps: 6,
    followUpsAnswered: 9,
    meetings: 13,
    meetingsWithPrep: 8,
    deadlines: 4,
    deadlinesMissed: 0,
    timeSaved: {
      unreadLowPriorityMails: 40,
      importantSummariesRead: 10,
      prepNotesGenerated: 3,
      followUpDraftsUsed: 2,
      repliesDrafted: 5,
      deadlinesCaught: 2,
    },
    meetingsByDay: { '2026-09-01': 3, '2026-09-02': 5, '2026-09-03': 5, '2026-09-04': 0 },
    topPeople: [
      { name: 'Ahmet Yılmaz', count: 4 },
      { name: '  ', count: 9 },
      { name: 'Zeynep Kaya', count: 7 },
      { name: 'Mehmet Demir', count: 4 },
      { name: 'Elif', count: 2 },
      { name: 'Can', count: 1 },
      { name: 'Deniz', count: 1 },
    ],
    nextWeek: { meetings: 4, deadlines: 2 },
  };

  it('assembles WeeklyMetrics with time saved, busiest day, top people and next-week line', () => {
    const m = buildWeeklyMetrics(raw);
    expect(m.weekStart).toBe('2026-08-31');
    expect(m.estimatedTimeSavedMinutes).toBe(103);
    expect(m.timeSavedBreakdown).toEqual({ unreadMails: 35, prepNotes: 36, followUpDrafts: 32 });
    expect(m.followUpsAnswered).toBe(6);
    expect(m.meetingsWithPrep).toBe(8);
    expect(m.busiestDay).toEqual({
      date: '2026-09-02',
      meetings: 5,
      note: 'En yoğun günün Çarşamba oldu: 5 toplantı.',
    });
    expect(m.topPeople).toEqual([
      { name: 'Zeynep Kaya', count: 7 },
      { name: 'Ahmet Yılmaz', count: 4 },
      { name: 'Mehmet Demir', count: 4 },
      { name: 'Elif', count: 2 },
      { name: 'Can', count: 1 },
    ]);
    expect(m.nextWeek).toBe('Gelecek hafta 4 toplantın ve 2 son tarihin var.');
  });

  it('supports English, editorial next-week text and empty inputs', () => {
    const en = buildWeeklyMetrics({
      ...raw,
      locale: 'en',
      nextWeek: { meetings: 1, deadlines: 0 },
    });
    expect(en.busiestDay?.note).toBe('Your busiest day was Wednesday: 5 meetings.');
    expect(en.nextWeek).toBe('Next week you have 1 meeting.');
    expect(
      buildWeeklyMetrics({ ...raw, nextWeek: 'Pazartesi sunumla başlıyorsun.' }).nextWeek,
    ).toBe('Pazartesi sunumla başlıyorsun.');
    expect(buildWeeklyMetrics({ ...raw, nextWeek: { meetings: 0, deadlines: 0 } }).nextWeek).toBe(
      'Gelecek hafta şimdilik sakin görünüyor.',
    );
    const empty = buildWeeklyMetrics({
      ...raw,
      meetingsByDay: {},
      topPeople: [],
      nextWeek: null,
      timeSaved: {},
    });
    expect(empty.busiestDay).toBeNull();
    expect(empty.topPeople).toEqual([]);
    expect(empty.estimatedTimeSavedMinutes).toBe(0);
    expect(empty.nextWeek).toBe('Gelecek haftanın planı yaklaştıkça netleşecek.');
  });
});
