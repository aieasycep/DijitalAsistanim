import { describe, expect, it } from 'vitest';
import type { CalendarCreatePayload, CalendarUpdatePayload } from '@da/domain';
import { createDemoDataSource } from './index';
import {
  BRIEFING_EVENING,
  COMMITMENT_MEHMET_TEKLIF,
  CONTACT_SELIN,
  EVENT_MEHMET_MEETING,
  FOLLOWUP_MEHMET_TEKLIF,
  INSIGHT_TRENDYOL,
  LEARNED_PROMOTIONS,
  REMINDER_AHMET_TEKLIF,
  TASK_TEKLIF_HAZIRLAMA,
} from './ids';

const make = (now: string) =>
  createDemoDataSource(
    {
      mode: 'demo',
      appScheme: 'dijitalasistan://oauth',
      webUrl: 'https://dijitalasistan.app/',
      now: () => new Date(now),
      timezone: 'Europe/Istanbul',
      isProduction: false,
    },
    { timeScale: 0 },
  );

describe('smoke', () => {
  it('afternoon clock', async () => {
    const ds = make('2026-09-05T13:00:00Z'); // 16:00 Istanbul
    const ended = await ds.meetings.listRecentlyEndedMeetings({ hours: 3 });
    expect(ended.map((e) => e.id)).toEqual([EVENT_MEHMET_MEETING]);
    await ds.meetings.markPostMeetingHandled(EVENT_MEHMET_MEETING);
    expect(await ds.meetings.listRecentlyEndedMeetings()).toEqual([]);
    expect((await ds.feed.getToday()).greeting).toBe('İyi günler, Yunus');
    const evening = await ds.briefings.getBriefing({ kind: 'evening' });
    const audio = await ds.briefings.getAudio(BRIEFING_EVENING);
    expect(audio.chapters.length).toBeGreaterThan(3);
    expect(evening?.subline).toContain('Yarın 09:00 Haftalık ekip');
    const midday = await ds.briefings.getBriefing({ kind: 'midday' });
    expect(midday?.generatedAt).toBe('2026-09-05T10:00:00.000Z');
    const analysis = await ds.onboarding.getInitialAnalysisStatus();
    expect(analysis.step).toBe('done');
    expect(analysis.insights).toHaveLength(5);
    const generic = await ds.meetings.getMeetingPrep('00000000-0000-4000-8000-0000000000d2');
    expect(generic.talkingPoints.length).toBeGreaterThan(0);
    expect(generic.purpose).toContain('Ürün gözden geçirme');
  });

  it('assistant intents', async () => {
    const ds = make('2026-09-05T05:00:00Z');
    const tomorrow = await ds.assistant.ask({ message: 'Yarın yoğun muyum?', inputMode: 'text' });
    expect(tomorrow.message.content).toContain('Haftalık ekip');
    expect(tomorrow.message.content).toContain('TK2412');
    const deadlines = await ds.assistant.ask({
      message: "Bu hafta hangi deadline'lar var?",
      inputMode: 'text',
    });
    expect(deadlines.message.content).toContain('3 son tarih');
    const briefing = await ds.assistant.ask({ message: 'Brifingimi oku.', inputMode: 'voice' });
    expect(briefing.message.content).toContain('Bugün bilmen gereken 5 şey var.');
    const pay = await ds.assistant.ask({
      message: 'Elektrik faturasını ne zaman ödemeliyim?',
      inputMode: 'text',
    });
    expect(pay.message.content).toContain('1.842');
    const waiting = await ds.assistant.ask({
      message: 'Kimlere cevap vermem gerekiyor?',
      inputMode: 'text',
    });
    expect(waiting.message.content).toContain('2 kişi senden cevap bekliyor');
    const last = await ds.assistant.ask({
      message: 'Mehmet ile en son ne konuştuk?',
      inputMode: 'text',
    });
    expect(last.message.content).toContain('1 Eylül');
    const move = await ds.assistant.ask({
      message: "Mehmet toplantısını 16:30'a al",
      inputMode: 'text',
    });
    expect(move.approvals[0]?.type).toBe('calendar_update');
    expect((move.approvals[0]?.payload as CalendarUpdatePayload).changes.startAt).toBe(
      '2026-09-05T13:30:00.000Z',
    );
    const create = await ds.assistant.ask({
      message: 'Yarın 15:00 Ahmet ile toplantı ekle',
      inputMode: 'text',
    });
    expect(create.approvals[0]?.type).toBe('calendar_create');
    const payload = create.approvals[0]?.payload as CalendarCreatePayload;
    expect(payload.title).toBe('Ahmet ile toplantı');
    expect(payload.startAt).toBe('2026-09-06T12:00:00.000Z');
    expect(payload.attendees?.[0]?.email).toBe('ahmet@firma.com');
    const reply = await ds.assistant.ask({
      message: "Selin'e yanıt taslağı hazırla",
      inputMode: 'text',
    });
    expect(reply.approvals[0]?.type).toBe('email_send');
    const scoped = await ds.assistant.suggestedQuestions({ contactId: CONTACT_SELIN });
    expect(scoped.questions[0]?.text).toBe('Selin ile en son ne konuştuk?');
    const flight = await ds.assistant.ask({
      message: 'Geçen ayki uçak bileti ne kadardı?',
      inputMode: 'text',
    });
    expect(flight.message.uncertain).toBe(true);
    expect(flight.message.content).toContain('TK2412');
  });

  it('captures, people, rules, plan mutations, privacy', async () => {
    const ds = make('2026-09-05T05:00:00Z');
    const link = await ds.capture.createCapture({
      kind: 'link',
      url: 'https://www.biletix.com/etkinlik/konser-zorlu-psm-12-eylul',
      origin: 'share_extension',
    });
    const linkAnalyzed = await ds.capture.analyzeCapture(link.id);
    expect(linkAnalyzed.analysis?.detectedType).toBe('event');
    expect(linkAnalyzed.analysis?.keyPoints).toContain('2 bilet · 1.450 TL');
    const other = await ds.capture.createCapture({
      kind: 'link',
      url: 'https://example.com/blog/post',
      origin: 'in_app',
    });
    expect((await ds.capture.analyzeCapture(other.id)).analysis?.title).toBe('example.com');
    const pdf = await ds.capture.createCapture({
      kind: 'pdf',
      storagePath: 'x/Hizmet_Sozlesmesi_v3.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 100,
      origin: 'in_app',
    });
    const pdfAnalyzed = await ds.capture.analyzeCapture(pdf.id);
    expect(pdfAnalyzed.analysis?.deadline?.dueText).toBe('19 Eylül');
    expect(pdfAnalyzed.analysis?.suggestedActions.map((a) => a.kind)).toEqual([
      'add_to_calendar',
      'create_task',
      'remind',
    ]);
    await ds.people.setVip(CONTACT_SELIN, true);
    expect((await ds.people.listVips()).some((v) => v.contactId === CONTACT_SELIN)).toBe(true);
    await ds.people.setVip(CONTACT_SELIN, false);
    expect((await ds.people.listVips()).some((v) => v.contactId === CONTACT_SELIN)).toBe(false);
    const rule = await ds.rules.upsertRule({
      type: 'keyword_high',
      value: 'teklif',
      label: 'Teklif önemli',
      enabled: true,
      position: 0,
    });
    await ds.rules.reorderRules([rule.id]);
    expect((await ds.rules.listRules())[0]?.id).toBe(rule.id);
    await ds.rules.deleteRule(rule.id);
    expect((await ds.rules.listRules()).some((r) => r.id === rule.id)).toBe(false);
    await ds.rules.deleteLearnedPreference(LEARNED_PROMOTIONS);
    await ds.feed.sendFeedback({
      kind: 'not_important',
      entityType: 'email_thread',
      entityId: '00000000-0000-4000-8000-0000000000ea',
    });
    expect(
      (await ds.rules.listLearnedPreferences()).some((l) => l.subjectKey === 'category:promotion'),
    ).toBe(false);
    await ds.profile.updatePreferences({ learnFromInteractions: false });
    const before = (await ds.rules.listLearnedPreferences()).length;
    await ds.feed.resolveInsight(INSIGHT_TRENDYOL, 'dismissed');
    expect((await ds.rules.listLearnedPreferences()).length).toBe(before);
    const task = await ds.plan.completeTask(TASK_TEKLIF_HAZIRLAMA, true);
    expect(task.status).toBe('completed');
    const postponed = await ds.plan.postponeCommitment(
      COMMITMENT_MEHMET_TEKLIF,
      '2026-09-08T15:00:00.000Z',
    );
    expect(postponed.status).toBe('postponed');
    const snoozed = await ds.email.snoozeFollowUp(
      FOLLOWUP_MEHMET_TEKLIF,
      '2026-09-06T06:00:00.000Z',
    );
    expect(snoozed.status).toBe('snoozed');
    const draft = await ds.email.draftFollowUpMessage(FOLLOWUP_MEHMET_TEKLIF);
    expect(draft.draft).toContain('2 Eylül');
    await ds.reminders.cancelReminder(REMINDER_AHMET_TEKLIF);
    expect(await ds.reminders.listReminders({ status: 'cancelled' })).toHaveLength(1);
    const device = await ds.accounts.registerDeviceCalendar({
      provider: 'apple',
      displayName: 'iPhone Takvim',
      calendarIds: ['cal-1'],
    });
    await ds.accounts.upsertDeviceEvents(device.id, [
      {
        accountId: device.id,
        externalEventId: 'ek-1',
        calendarId: 'cal-1',
        title: 'Spor',
        description: null,
        location: null,
        meetingUrl: null,
        meetingProvider: null,
        startAt: '2026-09-05T15:00:00.000Z',
        endAt: '2026-09-05T16:00:00.000Z',
        allDay: false,
        attendees: [],
        organizerIsUser: true,
        status: 'confirmed',
        providerUpdatedAt: null,
        source: 'apple_calendar',
        prepGeneratedAt: null,
        postMeetingHandledAt: null,
        isAiCreated: false,
        deletedAt: null,
      },
    ]);
    expect(
      (
        await ds.plan.listEvents({
          from: '2026-09-05T14:00:00.000Z',
          to: '2026-09-05T17:00:00.000Z',
        })
      ).some((e) => e.title === 'Spor'),
    ).toBe(true);
    const start = await ds.accounts.startOAuth({
      provider: 'google',
      kinds: ['email'],
      redirectTo: 'dijitalasistan://oauth',
    });
    expect(start.authorizationUrl.startsWith('dijitalasistan://oauth/google?state=')).toBe(true);
    const counts = await ds.privacy.deleteHistory({ olderThanDays: 0 });
    expect(counts.memoryChunks).toBeGreaterThan(0);
    expect(counts.emailAnalyses).toBeGreaterThan(5);
    const mail = await ds.feed.getMailIntelligence();
    // Seed mails stamped after the frozen 08:00 clock (Ahmet 08:42, Mehmet 12:12) legitimately keep their analysis.
    expect(mail.categories.has_deadline.count).toBeLessThanOrEqual(1);
  });
});
