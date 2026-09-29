import type { ReminderOption, SmartReminderSuggestResponse } from '@da/domain';
import { REMINDER_OPTIONS } from '@da/domain';
import { smartReminderSuggestSchema } from '@da/validation';
import type { RemindersApi } from '../../datasource';
import type { DemoContext } from '../context';
import { eventsOnDay } from '../core/calendar';
import { notFound, validate } from '../validate';

const LABELS: Record<ReminderOption, string> = {
  before_30m: '30 dakika önce',
  before_1h: '1 saat önce',
  this_evening: 'Bu akşam',
  tomorrow_morning: 'Yarın sabah',
  smart: 'Uygun zamanda',
  custom: 'Özel zaman',
};

const SMART_LEAD_MINUTES = 25;
const SMART_FALLBACK_TIME = '12:10';

export function createRemindersApi(ctx: DemoContext): RemindersApi {
  return {
    suggestReminder: (req) =>
      ctx.run((): SmartReminderSuggestResponse => {
        const clean = validate(smartReminderSuggestSchema, req);
        const clock = ctx.clock;
        const now = clock.now().getTime();
        const today = clock.today();
        const tomorrow = clock.addDays(today, 1);
        const base = clean.dueAt ? Date.parse(clean.dueAt) : now + 2 * 60 * 60_000;
        const eveningToday = clock.at(today, '19:00');
        const thisEvening =
          eveningToday.getTime() > now ? eveningToday : clock.at(tomorrow, '19:00');
        const nextMeeting = eventsOnDay(ctx.store.state, clock, today).find(
          (e) =>
            !e.allDay &&
            Date.parse(e.startAt) - SMART_LEAD_MINUTES * 60_000 > now &&
            e.id !== clean.targetId,
        );
        let smartAt: Date;
        let smartReason: string;
        if (nextMeeting) {
          smartAt = new Date(Date.parse(nextMeeting.startAt) - SMART_LEAD_MINUTES * 60_000);
          smartReason = `Takviminde ${clock.hhmm(smartAt)} boş; ${nextMeeting.title} öncesi.`;
        } else {
          const noonToday = clock.at(today, SMART_FALLBACK_TIME);
          smartAt = noonToday.getTime() > now ? noonToday : clock.at(tomorrow, SMART_FALLBACK_TIME);
          smartReason = `Takviminde ${SMART_FALLBACK_TIME} boş; toplantından önce.`;
        }
        const custom = clean.dueAt ? new Date(base) : new Date(now + 60 * 60_000);
        const at: Record<ReminderOption, Date> = {
          before_30m: new Date(base - 30 * 60_000),
          before_1h: new Date(base - 60 * 60_000),
          this_evening: thisEvening,
          tomorrow_morning: clock.at(tomorrow, '09:10'),
          smart: smartAt,
          custom,
        };
        return {
          options: REMINDER_OPTIONS.map((option) => ({
            option,
            at: at[option].toISOString(),
            label: LABELS[option],
            reason:
              option === 'smart'
                ? smartReason
                : option === 'before_30m' || option === 'before_1h'
                  ? clean.dueAt
                    ? null
                    : 'Son tarih yok; şimdiden 2 saat sonrasına göre.'
                  : null,
          })),
          smart: { at: smartAt.toISOString(), reason: smartReason },
        };
      }),
    listReminders: (input) =>
      ctx.run(() =>
        ctx.store.state.reminders
          .filter((r) => !input?.status || r.status === input.status)
          .sort((a, b) => Date.parse(a.remindAt) - Date.parse(b.remindAt))
          .map((r) => ({ ...r })),
      ),
    cancelReminder: (id) =>
      ctx.run(() => {
        ctx.store.mutate((s) => {
          const r = s.reminders.find((x) => x.id === id);
          if (!r) throw notFound('Hatırlatıcı', id);
          r.status = 'cancelled';
          r.updatedAt = ctx.nowIso();
        });
      }),
    completeReminder: (id) =>
      ctx.run(() => {
        ctx.store.mutate((s) => {
          const r = s.reminders.find((x) => x.id === id);
          if (!r) throw notFound('Hatırlatıcı', id);
          r.status = 'completed';
          r.updatedAt = ctx.nowIso();
        });
      }),
    reminderOptionLabels: () => [...REMINDER_OPTIONS],
  };
}
