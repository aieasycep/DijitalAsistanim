import { describe, expect, it } from 'vitest';
import {
  assistantAnswerAiSchema,
  captureCreateRequestSchema,
  createApprovalRequestSchema,
  emailAnalysisAiSchema,
  lifeEventExtractionSchema,
  referralRedeemSchema,
  timezoneSchema,
  userPreferencesUpdateSchema,
} from './index';

const validAnalysis = {
  summary: 'Ahmet bugün 17:00’ye kadar revize teklif bekliyor.',
  importance: 'critical',
  category: 'action_required',
  reasonImportant: 'Bugün 17:00’ye kadar cevap istendi.',
  requiresUserAction: true,
  deadline: { iso: '2026-09-05T14:00:00.000Z', text: 'bugün 17:00', evidence: 'bugün saat 17:00’ye kadar' },
  keyPoints: ['Revize fiyat', 'Bugün 17:00', 'PDF formatı'],
  people: [{ name: 'Ahmet Yılmaz', email: 'ahmet@example.com', role: 'sender' }],
  commitments: [],
  followUp: null,
  suggestedActions: [{ kind: 'reply', label: 'Yanıtla' }],
  confidence: 0.92,
};

describe('AI schema validation', () => {
  it('accepts a well-formed email analysis', () => {
    const r = emailAnalysisAiSchema.safeParse(validAnalysis);
    expect(r.success).toBe(true);
  });

  it('rejects a deadline without evidence (anti-hallucination)', () => {
    const r = emailAnalysisAiSchema.safeParse({ ...validAnalysis, deadline: { iso: '2026-09-05T14:00:00.000Z', text: null } });
    expect(r.success).toBe(false);
  });

  it('rejects unknown importance and out-of-range confidence', () => {
    expect(emailAnalysisAiSchema.safeParse({ ...validAnalysis, importance: 'urgent' }).success).toBe(false);
    expect(emailAnalysisAiSchema.safeParse({ ...validAnalysis, confidence: 1.4 }).success).toBe(false);
  });

  it('limits key points and actions', () => {
    const r = emailAnalysisAiSchema.safeParse({ ...validAnalysis, keyPoints: ['a', 'b', 'c', 'd', 'e', 'f'] });
    expect(r.success).toBe(false);
  });

  it('life event amount must be non-negative and currency ISO-3', () => {
    expect(
      lifeEventExtractionSchema.safeParse({
        type: 'payment',
        title: 'Elektrik faturası',
        details: { amount: 1842, currency: 'TRY', dueAt: '2026-09-10T00:00:00.000Z', payee: 'CK Enerji' },
        evidence: ['1.842 TL', 'son ödeme 10 Eylül'],
        confidence: 0.8,
      }).success,
    ).toBe(true);
    expect(
      lifeEventExtractionSchema.safeParse({ type: 'payment', title: 'x', details: { amount: -1, currency: 'TL' }, confidence: 0.5 })
        .success,
    ).toBe(false);
  });

  it('assistant answer defaults to no write intents', () => {
    const r = assistantAnswerAiSchema.parse({ answer: 'Bugün 3 önemli konu var.' });
    expect(r.writeIntents).toEqual([]);
    expect(r.uncertain).toBe(false);
  });
});

describe('API schema validation', () => {
  it('validates approval payload against the action type', () => {
    const base = {
      type: 'reminder_create',
      what: 'Hatırlatıcı kur',
      why: 'Son tarih yaklaşıyor',
      changeSummary: ['Yarın 09:10'],
      requestedBy: 'email_detail',
      idempotencyKey: 'reminder:thread-1:1',
    };
    expect(
      createApprovalRequestSchema.safeParse({
        ...base,
        payload: { title: 'Teklif', remindAt: '2026-09-06T06:10:00.000Z', option: 'tomorrow_morning' },
      }).success,
    ).toBe(true);
    expect(createApprovalRequestSchema.safeParse({ ...base, payload: { title: 'Teklif' } }).success).toBe(false);
  });

  it('requires the right field per capture kind', () => {
    expect(captureCreateRequestSchema.safeParse({ kind: 'link', url: 'https://example.com' }).success).toBe(true);
    expect(captureCreateRequestSchema.safeParse({ kind: 'link' }).success).toBe(false);
    expect(captureCreateRequestSchema.safeParse({ kind: 'image' }).success).toBe(false);
  });

  it('normalises referral codes', () => {
    expect(referralRedeemSchema.parse({ code: ' yunus7k ' }).code).toBe('YUNUS7K');
    expect(referralRedeemSchema.safeParse({ code: 'ab' }).success).toBe(false);
  });

  it('validates timezone and partial preferences', () => {
    expect(timezoneSchema.safeParse('Europe/Istanbul').success).toBe(true);
    expect(timezoneSchema.safeParse('Mars/Olympus').success).toBe(false);
    expect(userPreferencesUpdateSchema.safeParse({ theme: 'dark' }).success).toBe(true);
    expect(userPreferencesUpdateSchema.safeParse({ theme: 'sepia' }).success).toBe(false);
  });
});
