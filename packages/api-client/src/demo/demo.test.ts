import { describe, expect, it } from 'vitest';
import type { ApprovalAction, EmailSendPayload } from '@da/domain';
import { MemoryStorage, type DataSourceConfig, type KeyValueStorage } from '../config';
import { ClientApiError } from '../errors';
import { createDemoDataSource, type DemoDataSourceOptions } from './index';
import {
  ACCOUNT_GMAIL,
  APPROVAL_AHMET_REPLY,
  APPROVAL_BASVURU_CALENDAR,
  BRIEFING_EVENING,
  BRIEFING_MORNING,
  CONTACT_MEHMET,
  EVENT_MEHMET_MEETING,
  INSIGHT_AHMET_REVIZE,
  INSIGHT_SELIN_WAITING,
  INSIGHT_TRENDYOL,
  LIFE_THY,
  THREAD_AHMET_REVIZE,
  THREAD_SELIN_SOZLESME,
  THREAD_THY,
} from './ids';

const NOW = '2026-09-05T05:00:00Z'; // 08:00 Europe/Istanbul, Saturday 5 September 2026

function makeSource(
  overrides: Partial<DataSourceConfig> = {},
  options: DemoDataSourceOptions = { timeScale: 0 },
) {
  return createDemoDataSource(
    {
      mode: 'demo',
      appScheme: 'dijitalasistan',
      webUrl: 'https://dijitalasistan.app',
      now: () => new Date(NOW),
      timezone: 'Europe/Istanbul',
      isProduction: false,
      ...overrides,
    },
    options,
  );
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('demo data source · determinism', () => {
  it('produces identical data for the same injected clock', async () => {
    const a = makeSource();
    const b = makeSource();
    const [todayA, todayB] = await Promise.all([a.feed.getToday(), b.feed.getToday()]);
    expect(todayA.priorities.map((p) => p.id)).toEqual(todayB.priorities.map((p) => p.id));
    expect(JSON.stringify(todayA)).toBe(JSON.stringify(todayB));
    const insight = await a.feed.getInsight(INSIGHT_AHMET_REVIZE);
    expect(insight.dueAt).toBe('2026-09-05T14:00:00.000Z'); // 17:00 Istanbul
    const event = await a.plan.getEvent(EVENT_MEHMET_MEETING);
    expect(event.startAt).toBe('2026-09-05T11:30:00.000Z'); // 14:30 Istanbul
  });
});

describe('demo data source · today feed', () => {
  it('returns the morning shape with 5 diversified priorities', async () => {
    const ds = makeSource();
    const today = await ds.feed.getToday();
    expect(today.greeting).toContain('Günaydın');
    expect(today.greeting).toContain('Yunus');
    expect(today.dateLabel).toBe('5 Eylül Cumartesi');
    expect(today.isEvening).toBe(false);
    expect(today.priorities).toHaveLength(5);
    expect(new Set(today.priorities.map((p) => p.kind)).size).toBe(5);
    expect(today.priorities[0]?.id).toBe(INSIGHT_AHMET_REVIZE);
    expect(today.meetings.map((m) => m.entityId)).toContain(EVENT_MEHMET_MEETING);
    expect(today.pendingApprovals).toBe(2);
    expect(today.briefing?.id).toBe(BRIEFING_MORNING);
    expect(today.briefing?.items).toHaveLength(15);
  });

  it('greets by local hour and uses the configured demo name', async () => {
    const ds = makeSource({ now: () => new Date('2026-09-05T17:30:00Z'), demoUserName: 'Ayşe' });
    const today = await ds.feed.getToday();
    expect(today.greeting).toBe('İyi akşamlar, Ayşe');
    expect(today.isEvening).toBe(true);
  });

  it('paginates the flow with tag filters', async () => {
    const ds = makeSource();
    const first = await ds.feed.getFlow({ filter: 'all', limit: 4 });
    expect(first.items).toHaveLength(4);
    expect(first.nextCursor).toBe('4');
    const second = await ds.feed.getFlow({
      filter: 'all',
      limit: 4,
      cursor: first.nextCursor ?? undefined,
    });
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
    const personal = await ds.feed.getFlow({ filter: 'personal' });
    expect(personal.items.every((i) => i.tags.includes('personal'))).toBe(true);
  });
});

describe('demo data source · approvals', () => {
  it('approve → executed applies the email side effect', async () => {
    const ds = makeSource();
    const counts: number[] = [];
    ds.approvals.onPendingChange?.((n) => counts.push(n));
    const result = await ds.approvals.decideApproval({
      approvalId: APPROVAL_AHMET_REPLY,
      decision: 'approve',
    });
    expect(result.status).toBe('executed');
    expect(result.approval.executedAt).toBeTruthy();
    const detail = await ds.email.getThread(THREAD_AHMET_REVIZE);
    expect(detail.messages).toHaveLength(2);
    expect(detail.messages[1]?.isFromUser).toBe(true);
    expect(detail.messages[1]?.bodyText).toContain('Yunus');
    expect(detail.thread.lastFromUser).toBe(true);
    const insight = await ds.feed.getInsight(INSIGHT_AHMET_REVIZE);
    expect(insight.status).toBe('completed');
    expect(await ds.approvals.pendingCount()).toBe(1);
    expect(counts).toContain(1);
    const today = await ds.feed.getToday();
    expect(today.priorities.map((p) => p.id)).not.toContain(INSIGHT_AHMET_REVIZE);
    const audit = await ds.privacy.listAuditLogs();
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining(['approval.approve', 'approval.execute', 'email.send']),
    );
  });

  it('reject marks the approval rejected and lowers the pending count', async () => {
    const ds = makeSource();
    const result = await ds.approvals.decideApproval({
      approvalId: APPROVAL_BASVURU_CALENDAR,
      decision: 'reject',
    });
    expect(result.status).toBe('rejected');
    expect(result.approval.rejectedAt).toBeTruthy();
    expect(await ds.approvals.pendingCount()).toBe(1);
    await expect(
      ds.approvals.decideApproval({ approvalId: APPROVAL_BASVURU_CALENDAR, decision: 'approve' }),
    ).rejects.toBeInstanceOf(ClientApiError);
  });

  it('createApproval is idempotent by idempotencyKey and validates payloads', async () => {
    const ds = makeSource();
    const req = {
      type: 'reminder_create' as const,
      what: 'Elektrik faturası · 10 Eylül',
      why: 'Fatura son ödeme tarihi.',
      changeSummary: ['1 hatırlatıcı'],
      payload: {
        title: 'Elektrik faturası',
        remindAt: '2026-09-09T07:00:00.000Z',
        option: 'custom' as const,
      },
      requestedBy: 'reminder' as const,
      idempotencyKey: 'test:reminder:ck-fatura',
    };
    const first = await ds.approvals.createApproval(req);
    const second = await ds.approvals.createApproval(req);
    expect(second.id).toBe(first.id);
    expect(await ds.approvals.pendingCount()).toBe(3);
    await expect(
      ds.approvals.createApproval({
        ...req,
        idempotencyKey: 'test:reminder:invalid',
        payload: { title: '', remindAt: 'not-a-date', option: 'custom' },
      }),
    ).rejects.toMatchObject({ code: 'validation' });
  });

  it('calendar_create executes into the plan and calendar_update moves the meeting', async () => {
    const ds = makeSource();
    const created = await ds.approvals.decideApproval({
      approvalId: APPROVAL_BASVURU_CALENDAR,
      decision: 'approve',
    });
    expect(created.status).toBe('executed');
    const plan = await ds.plan.getPlan({ date: '2026-09-05', range: 'day' });
    expect(
      plan.days[0]?.events.some((e) => e.title === 'Girişim Programı başvurusu' && e.isAiCreated),
    ).toBe(true);
    const event = await ds.plan.getEvent(EVENT_MEHMET_MEETING);
    const move = await ds.approvals.createApproval({
      type: 'calendar_update',
      what: "Mehmet toplantısını 16:30'a al",
      why: "Mehmet 16:00'yı önerdi; 16:00 dolu, 16:30 boş.",
      changeSummary: ['14:30 → 16:30'],
      payload: {
        accountId: ACCOUNT_GMAIL,
        eventId: event.id,
        externalEventId: event.externalEventId,
        changes: { startAt: '2026-09-05T13:30:00.000Z', endAt: '2026-09-05T14:30:00.000Z' },
      },
      requestedBy: 'midday',
      idempotencyKey: 'test:calendar_update:d1',
    });
    const moved = await ds.approvals.decideApproval({ approvalId: move.id, decision: 'approve' });
    expect(moved.status).toBe('executed');
    const updated = await ds.plan.getEvent(EVENT_MEHMET_MEETING);
    expect(updated.startAt).toBe('2026-09-05T13:30:00.000Z');
    const today = await ds.feed.getToday();
    expect(today.meetings[0]?.title.startsWith('16:30')).toBe(true);
    const day = await ds.plan.getPlan({ date: '2026-09-05', range: 'day' });
    expect(day.days[0]?.backToBackWarnings.length).toBeGreaterThan(0);
  });

  it('fails every 7th email_send once and recovers with retry', async () => {
    const ds = makeSource();
    const statuses: string[] = [];
    let lastApproval: ApprovalAction | undefined;
    for (let i = 0; i < 7; i += 1) {
      const payload: EmailSendPayload = {
        accountId: ACCOUNT_GMAIL,
        threadId: THREAD_SELIN_SOZLESME,
        to: [{ name: 'Selin Kaya', email: 'selin@hukuk.com' }],
        subject: `Re: Sözleşme taslağı ${i}`,
        bodyText: `Merhaba Selin, ${i}. deneme.\n\nYunus`,
        tone: 'short',
      };
      const approval = await ds.approvals.createApproval({
        type: 'email_send',
        what: 'Test',
        why: 'Test',
        changeSummary: [],
        payload,
        requestedBy: 'email_detail',
        idempotencyKey: `test:email_send:${i}`,
      });
      const decided = await ds.approvals.decideApproval({
        approvalId: approval.id,
        decision: 'approve',
      });
      statuses.push(decided.status);
      lastApproval = decided.approval;
    }
    expect(statuses.slice(0, 6).every((s) => s === 'executed')).toBe(true);
    expect(statuses[6]).toBe('failed');
    expect(lastApproval?.failureReason).toBe('Sağlayıcı geçici olarak yanıt vermedi.');
    const retried = await ds.approvals.retryApproval(lastApproval?.id ?? '');
    expect(retried.status).toBe('executed');
    expect(retried.approval.attemptCount).toBe(2);
  });
});

describe('demo data source · briefings', () => {
  it('closeDay marks the evening closed and carries selected insights to tomorrow', async () => {
    const ds = makeSource();
    const evening = await ds.briefings.getBriefing({ kind: 'evening' });
    expect(evening?.id).toBe(BRIEFING_EVENING);
    expect(evening?.items.filter((i) => i.section === 'completed')).toHaveLength(4);
    expect(
      evening?.items.some(
        (i) => i.section === 'first_event_tomorrow' && i.title === 'Haftalık ekip',
      ),
    ).toBe(true);
    expect(evening?.items.filter((i) => i.section === 'follow_ups').map((i) => i.meta)).toEqual([
      '4. gün',
      '15. gün',
    ]);
    const closed = await ds.briefings.closeDay({
      briefingId: BRIEFING_EVENING,
      carryOverInsightIds: [INSIGHT_SELIN_WAITING],
    });
    expect(closed.closedAt).toBeTruthy();
    const today = await ds.feed.getToday();
    expect(today.priorities.map((p) => p.id)).not.toContain(INSIGHT_SELIN_WAITING);
    const tomorrow = await ds.feed.getToday({ date: '2026-09-06' });
    expect(tomorrow.priorities.map((p) => p.id)).toContain(INSIGHT_SELIN_WAITING);
  });

  it('midday reports 2 changes until both are handled; weekly carries the design metrics', async () => {
    const ds = makeSource();
    const midday = await ds.briefings.getBriefing({ kind: 'midday' });
    expect(midday?.hasChanges).toBe(true);
    expect(midday?.highlightNumber).toBe(2);
    const thread = await ds.email.getThread('00000000-0000-4000-8000-0000000000eb');
    expect(thread.relatedInsight).toBeTruthy();
    if (thread.relatedInsight) await ds.feed.resolveInsight(thread.relatedInsight.id, 'completed');
    const followUps = await ds.email.listFollowUps();
    for (const f of followUps)
      if (f.counterpartName === 'Mehmet Yılmaz') await ds.email.closeFollowUp(f.id);
    const quiet = await ds.briefings.getBriefing({ kind: 'midday' });
    expect(quiet?.hasChanges).toBe(false);
    expect(quiet?.headline).toBe('Her şey planlandığı gibi.');
    const weekly = await ds.briefings.getWeekly();
    expect(weekly?.weekly?.analyzedEmails).toBe(684);
    expect(weekly?.weekly?.busiestDay?.note).toBe('Çarşamba 6 toplantı');
    expect(weekly?.weekly?.nextWeek).toBe('Salı 3 son tarih, Perşembe öğleden sonra boş');
    const audio = await ds.briefings.getAudio(BRIEFING_MORNING);
    expect(audio.provider).toBe('device_tts');
    expect(audio.chapters).toHaveLength(6);
    const regenerated = await ds.briefings.getBriefing({ kind: 'morning', regenerate: true });
    expect(regenerated?.version).toBe(2);
  });
});

describe('demo data source · billing & referral', () => {
  it('applies the referral rules', async () => {
    const ds = makeSource();
    expect(await ds.billing.redeemReferral({ code: 'YUNUS7K2' })).toEqual({
      ok: false,
      reason: 'self_referral',
    });
    expect(await ds.billing.redeemReferral({ code: 'ABCDEFGH' })).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(await ds.billing.redeemReferral({ code: 'demo2026' })).toEqual({
      ok: true,
      bonusDays: 14,
    });
    expect(await ds.billing.redeemReferral({ code: 'DEMO2026' })).toEqual({
      ok: false,
      reason: 'already_redeemed',
    });
    const status = await ds.billing.getReferralStatus();
    expect(status.inviteUrl).toBe('https://dijitalasistan.app/app/referral?code=YUNUS7K2');
    const entitlement = await ds.billing.getEntitlement();
    expect(entitlement.isPro).toBe(true);
    expect(entitlement.source).toBe('referral');
    expect(entitlement.quotas.assistantQueriesPerDay).toBe(300);
  });

  it('starts on the free plan and activates Pro through the demo purchase path', async () => {
    const ds = makeSource();
    const before = await ds.billing.getEntitlement();
    expect(before.isPro).toBe(false);
    expect(before.source).toBe('none');
    expect((await ds.profile.getProfile()).onboardingCompletedAt).toBeNull();
    const after = await ds.billing.recordDemoPurchase?.({ productId: 'da_pro_annual' });
    expect(after?.isPro).toBe(true);
    expect(after?.source).toBe('demo');
    const subs = await ds.billing.listSubscriptions();
    expect(subs.map((sub) => sub.productId)).toContain('da_pro_annual');
    await expect(
      ds.billing.recordDemoPurchase?.({ productId: 'da_pro_weekly' as 'da_pro_monthly' }),
    ).rejects.toThrow();
  });
});

describe('demo data source · search & capture', () => {
  it('finds the THY ticket for "uçak bileti"', async () => {
    const ds = makeSource();
    const res = await ds.search.search({ query: 'Geçen ay gelen uçak bileti' });
    expect(res.results.length).toBeGreaterThan(0);
    const ids = res.results.slice(0, 3).map((r) => r.entityId);
    expect(ids.some((id) => id === THREAD_THY || id === LIFE_THY)).toBe(true);
    expect(res.results[0]?.entityId).toBe(THREAD_THY);
    expect(`${res.results[0]?.title} ${res.results[0]?.summary}`).toContain('TK2412');
    expect(res.results[0]?.score).toBeGreaterThan(res.results[res.results.length - 1]?.score ?? 0);
    await ds.search.rememberQuery('uçak bileti');
    expect((await ds.search.recentQueries())[0]).toBe('uçak bileti');
  });

  it('analyzes an image capture into a calendar event', async () => {
    const ds = makeSource();
    const { storagePath } = await ds.capture.uploadCaptureFile({
      uri: 'file:///tmp/afis.png',
      mimeType: 'image/png',
      sizeBytes: 1024,
      fileName: 'konser-afisi.png',
    });
    expect(storagePath.startsWith('00000000-0000-4000-8000-000000000001/')).toBe(true);
    const capture = await ds.capture.createCapture({
      kind: 'image',
      storagePath,
      mimeType: 'image/png',
      sizeBytes: 1024,
      origin: 'in_app',
    });
    expect(capture.status).toBe('uploaded');
    const analyzed = await ds.capture.analyzeCapture(capture.id);
    expect(analyzed.status).toBe('analyzed');
    expect(analyzed.analysis?.event?.title).toBe('Konser · Zorlu PSM');
    expect(analyzed.analysis?.event?.startAt).toBe('2026-09-12T17:00:00.000Z');
    expect(analyzed.analysis?.suggestedActions.some((a) => a.kind === 'add_to_calendar')).toBe(
      true,
    );
    const text = await ds.capture.createCapture({
      kind: 'text',
      text: 'Perşembe 15:00 Ayşe ile kahve, öncesinde raporu bitir. Çarşamba akşamı bana hatırlat.',
      origin: 'in_app',
    });
    const textAnalyzed = await ds.capture.analyzeCapture(text.id);
    expect(textAnalyzed.analysis?.event?.title).toBe('Ayşe ile kahve');
    expect(textAnalyzed.analysis?.event?.startAt).toBe('2026-09-10T12:00:00.000Z');
    expect(textAnalyzed.analysis?.task?.title).toBe('Raporu bitir');
    expect(textAnalyzed.analysis?.suggestedActions.map((a) => a.kind)).toEqual([
      'add_to_calendar',
      'create_task',
      'remind',
    ]);
    await ds.capture.deleteCapture(text.id);
    expect((await ds.capture.listCaptures()).map((c) => c.id)).not.toContain(text.id);
    const ticket = await ds.capture.createCapture({
      kind: 'text',
      text: '12 Eylül 20:00 Zorlu PSM konser bileti',
      origin: 'in_app',
    });
    const ticketAnalyzed = await ds.capture.analyzeCapture(ticket.id);
    expect(ticketAnalyzed.analysis?.detectedType).toBe('event');
    expect(ticketAnalyzed.analysis?.event?.startAt).toBe('2026-09-12T17:00:00.000Z');
    expect(
      ticketAnalyzed.analysis?.suggestedActions.some((a) => a.kind === 'add_to_calendar'),
    ).toBe(true);
  });
});

describe('demo data source · auth, privacy & persistence', () => {
  it('deleteAccount wipes state and signs out', async () => {
    const ds = makeSource();
    expect(await ds.auth.getSession()).toBeNull();
    await ds.auth.signInWithApple({ identityToken: 'demo', nonce: 'n' });
    expect((await ds.auth.getSession())?.user.provider).toBe('apple');
    await expect(
      ds.privacy.deleteAccount({ confirmation: 'yanlış' as 'SİL' }),
    ).rejects.toMatchObject({ code: 'validation' });
    await ds.privacy.deleteAccount({ confirmation: 'SİL' });
    expect(await ds.auth.getSession()).toBeNull();
    expect(await ds.accounts.listAccounts()).toEqual([]);
    expect((await ds.feed.getToday()).priorities).toEqual([]);
    expect((await ds.privacy.listAuditLogs()).map((a) => a.action)).toEqual(['account.delete']);
  });

  it('persists state and session through storage', async () => {
    const storage: KeyValueStorage = new MemoryStorage();
    const first = makeSource({ storage });
    await first.auth.signInWithIdToken({ provider: 'google', idToken: 'demo' });
    await first.feed.resolveInsight(INSIGHT_TRENDYOL, 'completed');
    await wait(30);
    const second = makeSource({ storage });
    expect((await second.auth.getSession())?.user.provider).toBe('google');
    expect((await second.feed.getInsight(INSIGHT_TRENDYOL)).status).toBe('completed');
    await second.clearLocalState();
    expect(await second.auth.getSession()).toBeNull();
    expect((await second.feed.getInsight(INSIGHT_TRENDYOL)).status).toBe('active');
    expect(await storage.getItem('da.demo.state.v1')).toBeNull();
  });

  it('ignores a corrupt snapshot', async () => {
    const storage = new MemoryStorage();
    await storage.setItem('da.demo.state.v1', '{not json');
    const ds = makeSource({ storage });
    expect((await ds.feed.getToday()).priorities).toHaveLength(5);
  });

  it('runs the export lifecycle', async () => {
    const ds = makeSource();
    const requested = await ds.privacy.requestExport();
    expect(requested.status).toBe('requested');
    await wait(20);
    const status = await ds.privacy.getExportStatus(requested.id);
    expect(status?.status).toBe('ready');
    expect(status?.downloadUrl).toBe('https://dijitalasistan.app/demo-export.json');
  });
});

describe('demo data source · onboarding, accounts, meetings, assistant', () => {
  it('progresses the initial analysis to done with 5 insights', async () => {
    const ds = makeSource({}, { timeScale: 0.01 });
    const started = await ds.onboarding.startInitialAnalysis({ windowHours: 72 });
    expect(started.step).toBe('scanning');
    await wait(150);
    const done = await ds.onboarding.getInitialAnalysisStatus();
    expect(done.step).toBe('done');
    expect(done.emailsFound).toBe(127);
    expect(done.potentialImportant).toBe(8);
    expect(done.insights).toHaveLength(5);
    expect(done.briefingId).toBe(BRIEFING_MORNING);
  });

  it('connects an OAuth account through the demo callback', async () => {
    const ds = makeSource();
    const start = await ds.accounts.startOAuth({
      provider: 'microsoft',
      kinds: ['email', 'calendar'],
      redirectTo: 'dijitalasistan://oauth',
    });
    expect(start.authorizationUrl.startsWith('dijitalasistan://oauth/microsoft?state=demo-')).toBe(
      true,
    );
    const url = new URL(start.authorizationUrl);
    const account = await ds.accounts.completeOAuth({
      state: url.searchParams.get('state') ?? '',
      status: 'ok',
      accountId: url.searchParams.get('accountId') ?? undefined,
    });
    expect(account?.provider).toBe('microsoft');
    expect(account?.displayName.startsWith('Outlook ·')).toBe(true);
    expect(await ds.accounts.listAccounts()).toHaveLength(3);
    await ds.accounts.disconnect(account?.id ?? '');
    expect(await ds.accounts.listAccounts()).toHaveLength(2);
  });

  it('builds the Mehmet meeting prep and extracts post-meeting commitments', async () => {
    const ds = makeSource();
    const prep = await ds.meetings.getMeetingPrep(EVENT_MEHMET_MEETING);
    expect(prep.primaryPerson?.id).toBe(CONTACT_MEHMET);
    expect(prep.talkingPoints.map((t) => t.title)).toEqual([
      'Revize fiyat',
      'Teslim tarihi',
      'Sözleşme maddesi',
    ]);
    expect(prep.lastContact?.summary).toContain('1 Eylül');
    const post = await ds.meetings.submitPostMeeting({
      eventId: EVENT_MEHMET_MEETING,
      text: "Mehmet'e yarın teklif göndereceğim. Sözleşme için hukuktan Perşembe'ye kadar yorum isteyeceğim.",
      inputMode: 'voice',
    });
    expect(post.proposals).toHaveLength(2);
    expect(post.proposals[0]?.commitment.text).toBe("Mehmet'e teklif gönder");
    expect(post.proposals[0]?.commitment.dueAt).toBe('2026-09-06T15:00:00.000Z');
    expect(post.proposals[1]?.commitment.text).toContain('iste');
    expect(post.proposals[1]?.commitment.dueAt).toBe('2026-09-10T15:00:00.000Z');
    expect(await ds.approvals.pendingCount()).toBe(4);
    expect(await ds.meetings.listRecentlyEndedMeetings()).toEqual([]);
  });

  it('answers grounded questions and turns write intents into approvals', async () => {
    const ds = makeSource();
    const focus = await ds.assistant.ask({
      message: 'Bugün neye odaklanmalıyım?',
      inputMode: 'text',
    });
    expect(focus.message.sources.length).toBeGreaterThan(0);
    expect(focus.message.uncertain).toBe(false);
    expect(focus.message.content).toContain('Ahmet');
    const reminder = await ds.assistant.ask({
      threadId: focus.threadId,
      message: "Yarın sabah Ahmet'e revize teklifi hatırlat",
      inputMode: 'text',
    });
    expect(reminder.approvals).toHaveLength(1);
    expect(reminder.approvals[0]?.type).toBe('reminder_create');
    expect(reminder.approvals[0]?.status).toBe('pending');
    expect(await ds.approvals.pendingCount()).toBe(3);
    const replied = await ds.assistant.ask({
      message: "Mehmet'ten cevap geldi mi?",
      inputMode: 'voice',
    });
    expect(replied.message.content).toContain('Henüz gelmedi');
    const draft = await ds.assistant.ask({
      threadId: replied.threadId,
      message: 'Evet, hazırla.',
      inputMode: 'voice',
    });
    expect(draft.approvals[0]?.type).toBe('email_send');
    expect((draft.approvals[0]?.payload as EmailSendPayload).to[0]?.email).toBe(
      'mehmet@musteri.com',
    );
    const unknown = await ds.assistant.ask({
      message: 'Kedimin veterineri kim?',
      inputMode: 'text',
    });
    expect(unknown.message.uncertain).toBe(true);
    const threads = await ds.assistant.listThreads();
    expect(threads.length).toBe(5);
    const messages = await ds.assistant.getThreadMessages(focus.threadId);
    expect(messages).toHaveLength(4);
    const suggested = await ds.assistant.suggestedQuestions();
    expect(suggested.questions[0]?.text).toBe('Bugün neye odaklanmalıyım?');
    expect(suggested.questions.some((q) => q.text === 'Mehmet ile en son ne konuştuk?')).toBe(true);
    expect(
      await ds.assistant.transcribe({ uri: 'x', mimeType: 'audio/m4a', durationSec: 3 }),
    ).toBeNull();
  });

  it('suggests the 6 reminder options with a smart slot before the next meeting', async () => {
    const ds = makeSource();
    const res = await ds.reminders.suggestReminder({
      targetType: 'email_thread',
      targetId: THREAD_AHMET_REVIZE,
      dueAt: '2026-09-05T14:00:00.000Z',
    });
    expect(res.options.map((o) => o.option)).toEqual([
      'before_30m',
      'before_1h',
      'this_evening',
      'tomorrow_morning',
      'smart',
      'custom',
    ]);
    expect(res.options[0]?.at).toBe('2026-09-05T13:30:00.000Z');
    expect(res.smart?.at).toBe('2026-09-05T11:05:00.000Z');
    expect(res.smart?.reason).toContain('14:05');
    expect(res.options.find((o) => o.option === 'tomorrow_morning')?.at).toBe(
      '2026-09-06T06:10:00.000Z',
    );
  });

  it('builds the plan with free blocks, the tomorrow suggestion and the conflict', async () => {
    const ds = makeSource();
    const week = await ds.plan.getPlan({ date: '2026-09-05', range: 'week' });
    expect(week.days).toHaveLength(7);
    expect(week.days[0]?.date).toBe('2026-08-31');
    const today = week.days.find((d) => d.date === '2026-09-05');
    expect(today?.events).toHaveLength(3);
    expect(today?.freeBlocks[0]?.startAt).toBe('2026-09-05T06:00:00.000Z');
    expect(week.suggestions[0]?.title).toBe('Yarın 14:00–16:30 arasında 2,5 saat boşluğun var.');
    expect(week.conflicts).toHaveLength(0); // the Doktor / Demir A.Ş. clash is on Monday 7 September (next week)
    const monday = await ds.plan.getPlan({ date: '2026-09-07', range: 'day' });
    expect(monday.conflicts).toHaveLength(1);
    expect(monday.conflicts[0]?.eventA.title).toBe('Müşteri toplantısı · Demir A.Ş.');
    expect(monday.conflicts[0]?.eventB.title).toBe('Doktor randevusu');
    expect(monday.conflicts[0]?.overlapMinutes).toBe(30);
    expect(await ds.plan.listConflicts()).toHaveLength(1);
    const conflict = monday.conflicts[0];
    if (conflict) {
      const ignored = await ds.plan.ignoreConflict(conflict.id);
      expect(ignored.status).toBe('ignored');
    }
    expect((await ds.plan.getPlan({ date: '2026-09-07', range: 'day' })).conflicts).toHaveLength(0);
    expect(
      (await ds.feed.getFlow({ filter: 'calendar' })).items.some((i) => i.kind === 'conflict'),
    ).toBe(false);
  });

  it('exposes mail intelligence buckets and person intelligence', async () => {
    const ds = makeSource();
    const mail = await ds.feed.getMailIntelligence();
    expect(mail.totalToday).toBe(46);
    expect(mail.categories.waiting_for_user.count).toBe(2);
    expect(mail.categories.low_priority.count).toBe(2);
    const person = await ds.people.getPerson(CONTACT_MEHMET);
    expect(person.upcomingMeetings[0]?.id).toBe(EVENT_MEHMET_MEETING);
    expect(person.userOwes.map((c) => c.text)).toContain("Mehmet'e teklif gönder");
    expect(person.openLoops).toBeGreaterThan(0);
    const vip = await ds.people.addVip({
      displayName: 'Selin Kaya',
      email: 'selin@hukuk.com',
      relation: 'Avukat',
    });
    expect(vip.contactId).toBeTruthy();
    expect(
      (await ds.rules.listLearnedPreferences()).some(
        (l) => l.statement === 'Selin Kaya yüksek öncelikli.',
      ),
    ).toBe(true);
    const drafts = await Promise.all(
      (['short', 'professional', 'friendly', 'detailed'] as const).map((tone) =>
        ds.email.draftReply({ threadId: THREAD_AHMET_REVIZE, tone }),
      ),
    );
    expect(new Set(drafts.map((d) => d.draft)).size).toBe(4);
    expect(drafts.every((d) => d.draft.endsWith('Yunus'))).toBe(true);
    const ingest = await ds.androidNotifications.ingest([
      {
        packageName: 'com.trendyol.app',
        appName: 'Trendyol',
        title: 'Kargon teslim edildi',
        text: 'Siparişin kapına bırakıldı.',
        postedAt: NOW,
        fingerprint: 'android-fp-00001',
      },
      {
        packageName: 'com.bank',
        appName: 'Banka',
        title: 'Doğrulama kodu',
        text: 'Kodunuz 483920',
        postedAt: NOW,
        fingerprint: 'android-fp-00002',
      },
      {
        packageName: 'com.bank',
        appName: 'Banka',
        title: 'Doğrulama kodu',
        text: 'Kodunuz 483920',
        postedAt: NOW,
        fingerprint: 'android-fp-00002',
      },
    ]);
    expect(ingest.accepted).toBe(2);
    const recent = await ds.androidNotifications.listRecent();
    expect(recent.find((n) => n.fingerprint === 'android-fp-00001')?.insightId).toBeTruthy();
    expect(recent.find((n) => n.fingerprint === 'android-fp-00002')?.insightId).toBeNull();
  });
});
