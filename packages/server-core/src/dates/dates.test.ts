import { describe, expect, it } from 'vitest';
import {
  addBusinessDays,
  deadlineFromText,
  extractDates,
  formatDateLabel,
  formatDateLocative,
  formatDeadlinePhrase,
  hasDeadlineVocabulary,
  lowercasePreservingIndices,
  nextWeekday,
  timeWithDative,
  turkishDative,
  turkishLocative,
  turkishNumberDative,
} from './index';

// Friday 4 September 2026, 08:42 in Istanbul (UTC+3)
const now = '2026-09-04T05:42:00.000Z';
const tz = 'Europe/Istanbul';
const ex = (text: string) => extractDates({ text, now, timezone: tz });
const one = (text: string) => {
  const r = ex(text);
  expect(r, `expected exactly one date in "${text}"`).toHaveLength(1);
  return r[0]!;
};

describe('dates · Turkish relative expressions', () => {
  it('bugün 17:00', () => {
    const d = one('bugün 17:00');
    expect(d.iso).toBe('2026-09-04T14:00:00.000Z');
    expect(d.kind).toBe('relative');
    expect(d.hasTime).toBe(true);
    expect(d.text).toBe('bugün 17:00');
  });
  it('yarın defaults to 09:00 local, yarın sabah / öğlen / akşam use time-of-day defaults', () => {
    expect(one('yarın').iso).toBe('2026-09-05T06:00:00.000Z');
    expect(one('yarın').hasTime).toBe(false);
    expect(one('yarın sabah').iso).toBe('2026-09-05T06:00:00.000Z');
    expect(one('yarın sabah').hasTime).toBe(true);
    expect(one('yarın öğlen').iso).toBe('2026-09-05T09:00:00.000Z');
    expect(one('yarın akşam').iso).toBe('2026-09-05T16:00:00.000Z');
    expect(one('bu akşam').iso).toBe('2026-09-04T16:00:00.000Z');
  });
  it('time-of-day words with an hour: akşam 8 → 20:00, sabah 9 → 09:00, öğleden sonra 3 → 15:00', () => {
    expect(one("yarın akşam 8'de").iso).toBe('2026-09-05T17:00:00.000Z');
    expect(one("sabah 9'da").iso).toBe('2026-09-04T06:00:00.000Z');
    expect(one("yarın öğleden sonra 3'te").iso).toBe('2026-09-05T12:00:00.000Z');
  });
  it('weekdays resolve to the next occurrence (today counts) and honour modifiers', () => {
    expect(one('Cuma').localDate).toBe('2026-09-04');
    expect(one('Pazartesi').localDate).toBe('2026-09-07');
    expect(one('SALI').localDate).toBe('2026-09-08');
    expect(one('önümüzdeki Cuma').localDate).toBe('2026-09-11');
    expect(one('gelecek hafta Salı').localDate).toBe('2026-09-08');
    expect(one('haftaya Salı').localDate).toBe('2026-09-08');
    expect(one('haftaya Perşembe').localDate).toBe('2026-09-10');
    expect(one('Cuma').kind).toBe('relative');
  });
  it('haftaya alone is +7 days; bu hafta içinde is Friday; ay sonu is the last day of month', () => {
    expect(one('haftaya').localDate).toBe('2026-09-11');
    expect(one('bu hafta içinde').localDate).toBe('2026-09-04');
    expect(one('ay sonuna kadar').localDate).toBe('2026-09-30');
    expect(one('ay sonuna kadar').kind).toBe('deadline');
  });
  it('durations: 3 gün içinde, 2 iş günü içinde (skips weekend), 2 saat içinde', () => {
    expect(one('3 gün içinde').localDate).toBe('2026-09-07');
    expect(one('2 iş günü içinde').localDate).toBe('2026-09-08');
    expect(one('2 saat içinde').iso).toBe('2026-09-04T07:42:00.000Z');
    expect(one('iki hafta sonra').localDate).toBe('2026-09-18');
  });
  it('hour-only forms need a preceding day ("yarın 10\'da"), otherwise they are ignored', () => {
    expect(one("yarın 10'da ararım").iso).toBe('2026-09-05T07:00:00.000Z');
    expect(one("Cuma günü saat 14:00'te toplantı").iso).toBe('2026-09-04T11:00:00.000Z');
    expect(ex("10'da 2 kişi")).toHaveLength(0);
  });
});

describe('dates · absolute dates', () => {
  it("12 Eylül 20:00 and 10 Eylül'e kadar", () => {
    const a = one('12 Eylül 20:00');
    expect(a.iso).toBe('2026-09-12T17:00:00.000Z');
    expect(a.kind).toBe('date');
    const b = one("10 Eylül'e kadar");
    expect(b.iso).toBe('2026-09-10T15:00:00.000Z');
    expect(b.kind).toBe('deadline');
    expect(b.hasTime).toBe(false);
    expect(b.cue).toBe('kadar');
  });
  it('numeric dates are day-first (5/9/2026, 05.09.2026) with month-first auto-detection when unambiguous', () => {
    expect(one('5/9/2026').localDate).toBe('2026-09-05');
    expect(one('05.09.2026').localDate).toBe('2026-09-05');
    expect(one('9/25/2026').localDate).toBe('2026-09-25');
    expect(ex('31/02/2026')).toHaveLength(0);
  });
  it('ISO strings with a zone keep the exact instant', () => {
    const d = one('2026-09-12T14:30:00Z');
    expect(d.iso).toBe('2026-09-12T14:30:00.000Z');
    expect(d.kind).toBe('date');
    expect(one('2026-09-12T14:30:00+03:00').iso).toBe('2026-09-12T11:30:00.000Z');
  });
  it('English month forms: Sept 12, September 12th 2026, 12 September 2026, next Tuesday 2pm', () => {
    expect(one('Sept 12').localDate).toBe('2026-09-12');
    expect(one('September 12th, 2026').localDate).toBe('2026-09-12');
    expect(one('12 September 2026').iso).toBe('2026-09-12T06:00:00.000Z');
    expect(one('next Tuesday 2pm').iso).toBe('2026-09-08T11:00:00.000Z');
    expect(one('Friday at 10:30am').iso).toBe('2026-09-04T07:30:00.000Z');
  });
  it('month names with Turkish suffixes and abbreviations', () => {
    expect(one("12 Eylül'de").localDate).toBe('2026-09-12');
    expect(one('12 Eylülde').localDate).toBe('2026-09-12');
    expect(one("Per 11 Eyl 14:00'a kadar").iso).toBe('2026-09-11T11:00:00.000Z');
    expect(one("Eylül ayının 15'inde").localDate).toBe('2026-09-15');
    expect(one("ayın 20'sine kadar").localDate).toBe('2026-09-20');
    expect(one('12 EYLÜL 2026').localDate).toBe('2026-09-12');
  });
  it('year-less dates stay in the current year unless far in the past, then roll over', () => {
    expect(one("1 Eylül'de gönderdim").localDate).toBe('2026-09-01');
    expect(one("3 Ocak'ta").localDate).toBe('2027-01-03');
  });
  it('weekday decorations are absorbed into absolute dates', () => {
    expect(one('12 Eylül Cuma 20:00').iso).toBe('2026-09-12T17:00:00.000Z');
    expect(one('Cuma, 12 Eylül 2026 14:00').iso).toBe('2026-09-12T11:00:00.000Z');
  });
  it('never invents a date from bare numbers, amounts or a month without a day', () => {
    expect(ex("Toplam 1.842,50 TL, sipariş no 1234567890, %20'ye varan indirim")).toHaveLength(0);
    expect(ex('2026 yılında 12 kişi')).toHaveLength(0);
    expect(ex("Eylül'de görüşelim")).toHaveLength(0);
    expect(ex('')).toHaveLength(0);
    expect(ex('v1.2.2026 sürümü')).toHaveLength(0);
  });
});

describe('dates · deadlines', () => {
  it("17:00'ye kadar is a deadline today", () => {
    const d = one("17:00'ye kadar");
    expect(d.kind).toBe('deadline');
    expect(d.iso).toBe('2026-09-04T14:00:00.000Z');
  });
  it('son ödeme tarihi 10 Eylül / SON ÖDEME TARİHİ: 10.09.2026', () => {
    const a = one('son ödeme tarihi 10 Eylül');
    expect(a.kind).toBe('deadline');
    expect(a.cue).toBe('son ödeme tarihi');
    expect(a.iso).toBe('2026-09-10T15:00:00.000Z');
    const b = one('SON ÖDEME TARİHİ: 10.09.2026');
    expect(b.kind).toBe('deadline');
    expect(b.localDate).toBe('2026-09-10');
  });
  it('English cues: before Friday, by EOD, Due: Sept 12', () => {
    expect(one('before Friday').kind).toBe('deadline');
    const eod = one('by EOD');
    expect(eod.kind).toBe('deadline');
    expect(eod.iso).toBe('2026-09-04T15:00:00.000Z');
    const due = one('Due: Sept 12, 2026');
    expect(due.kind).toBe('deadline');
    expect(due.localDate).toBe('2026-09-12');
  });
  it('deadlineFromText prefers cued spans and strong cues over plain mentions', () => {
    const text =
      "Toplantı 12 Eylül 20:00. Revize teklifi bugün saat 17:00'ye kadar bekliyoruz. Son ödeme tarihi 10 Eylül.";
    const d = deadlineFromText({ text, now, timezone: tz });
    expect(d?.cue).toBe('son ödeme tarihi');
    expect(d?.iso).toBe('2026-09-10T15:00:00.000Z');
    const d2 = deadlineFromText({
      text: "Revize teklifi bugün saat 17:00'ye kadar bekliyoruz. Toplantı yarın.",
      now,
      timezone: tz,
    });
    expect(d2?.iso).toBe('2026-09-04T14:00:00.000Z');
    expect(d2?.evidence).toContain('17:00');
  });
  it('deadlineFromText returns null when no deadline cue exists', () => {
    expect(
      deadlineFromText({ text: "Toplantı yarın 10:00'da ofiste.", now, timezone: tz }),
    ).toBeNull();
    expect(deadlineFromText({ text: 'Sipariş numaranız 1234567', now, timezone: tz })).toBeNull();
  });
  it('hasDeadlineVocabulary is a cheap signal', () => {
    expect(hasDeadlineVocabulary("Belgeleri Cuma'ya kadar iletmen gerekiyor")).toBe(true);
    expect(hasDeadlineVocabulary('Merhaba, nasılsın?')).toBe(false);
  });
});

describe('dates · evidence, ordering and long input', () => {
  it('returns matches in text order with short evidence snippets', () => {
    const text =
      "Ödeme 10 Eylül'e kadar yapılmalı. Toplantı ise yarın 14:00'te. Teslimat aralığı 14:00–18:00.";
    const r = ex(text);
    expect(r.map((d) => d.text)).toEqual(["10 Eylül'e", "yarın 14:00'te", '14:00', '18:00']);
    expect(r[0]!.evidence.length).toBeLessThanOrEqual(160);
    expect(r[0]!.evidence).toContain("10 Eylül'e kadar");
    expect(r[0]!.start).toBeLessThan(r[1]!.start);
  });
  it('a different timezone changes the instant but not the local date', () => {
    const berlin = extractDates({ text: 'yarın 09:00', now, timezone: 'Europe/Berlin' })[0]!;
    expect(berlin.localDate).toBe('2026-09-05');
    expect(berlin.iso).toBe('2026-09-05T07:00:00.000Z');
  });
  it('handles typographic apostrophes and invalid reference instants', () => {
    expect(one('Cuma’ya kadar').kind).toBe('deadline');
    expect(extractDates({ text: 'yarın', now: 'not-a-date', timezone: tz })).toHaveLength(0);
  });
  it('bounds very long inputs', () => {
    const text = `${'lorem ipsum '.repeat(3000)} yarın 17:00`;
    expect(ex(text).length).toBeLessThanOrEqual(1);
  });
});

describe('dates · formatting and Turkish helpers', () => {
  it('formatDateLabel: bugün / yarın / weekday / day month', () => {
    expect(formatDateLabel('2026-09-04T14:00:00.000Z', { now, timezone: tz, withTime: true })).toBe(
      'bugün 17:00',
    );
    expect(formatDateLabel('2026-09-05T06:00:00.000Z', { now, timezone: tz })).toBe('yarın');
    expect(formatDateLabel('2026-09-08T06:00:00.000Z', { now, timezone: tz })).toBe('Salı');
    expect(formatDateLabel('2026-09-20T06:00:00.000Z', { now, timezone: tz })).toBe('20 Eylül');
    expect(formatDateLabel('2027-01-03T06:00:00.000Z', { now, timezone: tz })).toBe('3 Ocak 2027');
    expect(formatDateLabel('2026-09-08T06:00:00.000Z', { now, timezone: tz, locale: 'en' })).toBe(
      'Tuesday',
    );
    expect(formatDateLabel('2026-09-20T06:00:00.000Z', { now, timezone: tz, locale: 'en' })).toBe(
      '20 September',
    );
  });
  it('formatDateLocative and formatDeadlinePhrase produce natural Turkish', () => {
    expect(formatDateLocative('2026-09-09T06:00:00.000Z', { now, timezone: tz })).toBe(
      "9 Eylül'de",
    );
    expect(formatDateLocative('2026-10-01T06:00:00.000Z', { now, timezone: tz })).toBe("1 Ekim'de");
    expect(formatDateLocative('2027-01-03T06:00:00.000Z', { now, timezone: tz })).toBe(
      "3 Ocak 2027'de",
    );
    expect(formatDateLocative('2026-09-05T06:00:00.000Z', { now, timezone: tz })).toBe('yarın');
    expect(
      formatDateLocative('2026-09-04T14:00:00.000Z', { now, timezone: tz, withTime: true }),
    ).toBe('bugün 17:00');
    expect(
      formatDateLocative('2026-09-09T06:00:00.000Z', { now, timezone: tz, locale: 'en' }),
    ).toBe('on 9 September');
    expect(formatDeadlinePhrase('2026-09-04T14:00:00.000Z', { now, timezone: tz })).toBe(
      "bugün 17:00'ye kadar",
    );
    expect(formatDeadlinePhrase('2026-09-04T15:00:00.000Z', { now, timezone: tz })).toBe(
      "bugün 18:00'e kadar",
    );
    expect(
      formatDeadlinePhrase('2026-09-05T15:00:00.000Z', { now, timezone: tz, hasTime: false }),
    ).toBe('yarın sonuna kadar');
    expect(
      formatDeadlinePhrase('2026-09-04T14:00:00.000Z', { now, timezone: tz, locale: 'en' }),
    ).toBe('by today 17:00');
  });
  it('suffix helpers follow vowel harmony', () => {
    expect(turkishDative('Mehmet')).toBe("Mehmet'e");
    expect(turkishDative('Ayşe')).toBe("Ayşe'ye");
    expect(turkishDative('Burak')).toBe("Burak'a");
    expect(turkishDative('Ali')).toBe("Ali'ye");
    expect(turkishLocative('Eylül')).toBe("Eylül'de");
    expect(turkishLocative('Ocak')).toBe("Ocak'ta");
    expect(turkishLocative('Mayıs')).toBe("Mayıs'ta");
    expect(turkishNumberDative(17)).toBe('ye');
    expect(turkishNumberDative(18)).toBe('e');
    expect(turkishNumberDative(30)).toBe('a');
    expect(turkishNumberDative(16)).toBe('ya');
    expect(timeWithDative(17, 0)).toBe("17:00'ye");
    expect(timeWithDative(17, 30)).toBe("17:30'a");
    expect(timeWithDative(10, 15)).toBe("10:15'e");
  });
  it('lowercasePreservingIndices keeps indices aligned for İ and typographic apostrophes', () => {
    const s = 'İSTANBUL’a Cuma';
    const l = lowercasePreservingIndices(s);
    expect(l.length).toBe(s.length);
    expect(l).toBe("istanbul'a cuma");
  });
  it('calendar helpers', () => {
    expect(addBusinessDays({ y: 2026, m: 9, d: 4 }, 1)).toEqual({ y: 2026, m: 9, d: 7 });
    expect(nextWeekday({ y: 2026, m: 9, d: 4 }, 5)).toEqual({ y: 2026, m: 9, d: 4 });
    expect(nextWeekday({ y: 2026, m: 9, d: 4 }, 5, { skipToday: true })).toEqual({
      y: 2026,
      m: 9,
      d: 11,
    });
    expect(nextWeekday({ y: 2026, m: 9, d: 4 }, 2, { nextWeek: true })).toEqual({
      y: 2026,
      m: 9,
      d: 8,
    });
  });
});
