import { describe, expect, it } from 'vitest';
import type { CalendarEvent, Capture, Commitment, Contact, EmailAnalysis, EmailThread, MemoryChunk, PostMeetingNote } from '@da/domain';
import { zonedTimeToUtc } from '../util';
import { buildFtsQuery, buildMemoryChunks, buildSourceRefs, canonicalNumber, extractFacts, groundingCheck, rankAndTrimContext, termOverlap, toSearchResults, type ScoredChunk } from './index';

const tz = 'Europe/Istanbul';
const at = (date: string, hhmm: string): string => zonedTimeToUtc(date, hhmm, tz);
const now = at('2026-09-05', '08:42');

function analysis(partial: Partial<EmailAnalysis> & { summary: string }): EmailAnalysis {
  return { importance: 'normal', category: 'information', requiresUserAction: false, keyPoints: [], people: [], commitments: [], suggestedActions: [], confidence: 0.9, producedBy: 'ai_large', ...partial };
}
let seq = 0;
function thread(partial: Partial<EmailThread> & { subject: string }): EmailThread {
  seq += 1;
  return {
    id: partial.id ?? `t-${seq}`,
    userId: 'u1',
    accountId: 'acc-1',
    externalThreadId: `ext-${seq}`,
    snippet: '',
    participants: [
      { name: 'Ahmet Yılmaz', email: 'ahmet@firma.com' },
      { name: 'Yunus Emre', email: 'yunus@example.com' },
    ],
    lastMessageAt: at('2026-09-05', '08:42'),
    messageCount: 1,
    lastFromUser: false,
    isRead: false,
    labels: ['INBOX'],
    importance: 'normal',
    category: 'information',
    analysis: null,
    priorityScore: 0,
    priorityReasons: [],
    triage: 'ai',
    fingerprint: `fp-${seq}`,
    userDismissed: false,
    userMarkedDone: false,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}
function chunk(partial: Partial<ScoredChunk> & { id: string; content: string }): ScoredChunk {
  return {
    userId: 'u1',
    sourceType: 'gmail',
    sourceId: partial.id,
    source: { type: 'gmail', id: partial.id, label: 'Gmail', timestamp: at('2026-09-04', '10:00') },
    topic: null,
    personName: null,
    contactId: null,
    occurredAt: at('2026-09-04', '10:00'),
    hasEmbedding: false,
    tokenCount: Math.ceil(partial.content.length / 4),
    expiresAt: null,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

const body = `Merhaba Yunus,

Dünkü görüşmemize istinaden revize fiyat teklifini bugün saat 17:00'ye kadar PDF formatında iletebilir misin? Yönetim toplantısında sunacağım.

Teşekkürler,
Ahmet Yılmaz

On Fri, Sep 4, 2026 Yunus wrote:
> eski alıntı burada`;

describe('memory · chunks', () => {
  it('builds an email chunk from summary, key points and a short excerpt (no quoted history)', () => {
    const t = thread({
      id: 'e1',
      subject: 'Re: Revize teklif',
      importance: 'critical',
      category: 'action_required',
      analysis: analysis({ summary: "Ahmet senden bugün 17:00'ye kadar revize teklif bekliyor.", importance: 'critical', category: 'action_required', requiresUserAction: true, deadlineText: 'bugün 17:00', keyPoints: ['Revize fiyat', 'PDF formatı'] }),
    });
    const [c] = buildMemoryChunks({ source: { kind: 'email_thread', entity: t, bodyText: body, contactId: 'c-ahmet' }, timezone: tz, userEmails: ['yunus@example.com'], retentionDays: 90 });
    expect(c).toBeDefined();
    if (!c) return;
    expect(c.content).toContain("Ahmet senden bugün 17:00'ye kadar revize teklif bekliyor.");
    expect(c.content).toContain('Öne çıkanlar: Revize fiyat; PDF formatı');
    expect(c.content).toContain('Son tarih: bugün 17:00');
    expect(c.content).toContain('Yönetim toplantısında sunacağım.');
    expect(c.content).not.toContain('eski alıntı');
    expect(c).toMatchObject({ sourceType: 'gmail', sourceId: 'e1', topic: 'Revize teklif', personName: 'Ahmet Yılmaz', contactId: 'c-ahmet', occurredAt: t.lastMessageAt, hasEmbedding: false });
    expect(c.tokenCount).toBeGreaterThan(20);
    expect(c.expiresAt).toBe(new Date(Date.parse(t.lastMessageAt) + 90 * 24 * 3600 * 1000).toISOString());
    expect(c.source).toMatchObject({ type: 'gmail', id: 'e1', label: 'Gmail', person: 'Ahmet Yılmaz', personId: 'c-ahmet' });
    expect((c.source.excerpt ?? '').length).toBeLessThanOrEqual(280);
  });
  it('caps the excerpt at 600 characters', () => {
    const long = 'Uzun bir metin. '.repeat(100);
    const [c] = buildMemoryChunks({ source: { kind: 'email_thread', entity: thread({ subject: 'Uzun', importance: 'high' }), bodyText: long }, timezone: tz });
    expect(c?.content.length).toBeLessThanOrEqual(600);
    expect(c?.content.endsWith('…')).toBe(true);
  });
  it('skips promotions, newsletters and low importance mails without action', () => {
    const promo = thread({ subject: 'İndirim', category: 'promotion', analysis: analysis({ summary: 'x', category: 'promotion' }) });
    const newsletter = thread({ subject: 'Bülten', labels: ['INBOX', 'CATEGORY_PROMOTIONS'], analysis: analysis({ summary: 'x' }) });
    const lowInert = thread({ subject: 'Bilgi', importance: 'low', analysis: analysis({ summary: 'x', importance: 'low' }) });
    const lowActionable = thread({ subject: 'Fatura', importance: 'low', analysis: analysis({ summary: 'Fatura 1.842 TL', importance: 'low', requiresUserAction: true }) });
    for (const t of [promo, newsletter, lowInert]) expect(buildMemoryChunks({ source: { kind: 'email_thread', entity: t, bodyText: body }, timezone: tz })).toEqual([]);
    expect(buildMemoryChunks({ source: { kind: 'email_thread', entity: lowActionable }, timezone: tz })).toHaveLength(1);
    expect(buildMemoryChunks({ source: { kind: 'email_thread', entity: thread({ subject: 'Boş' }) }, timezone: tz })).toEqual([]);
  });
  it('builds chunks for events, commitments, captures and meeting notes', () => {
    const event: CalendarEvent = {
      id: 'd1',
      userId: 'u1',
      accountId: 'acc-1',
      externalEventId: 'x',
      calendarId: 'primary',
      title: 'Mehmet ile müşteri toplantısı',
      description: 'Teklif v2 ve teslim takvimi',
      location: 'Ofis',
      meetingUrl: 'https://meet.google.com/abc',
      meetingProvider: 'google_meet',
      startAt: at('2026-09-05', '14:30'),
      endAt: at('2026-09-05', '15:30'),
      allDay: false,
      attendees: [
        { name: 'Mehmet Yılmaz', email: 'mehmet@musteri.com', contactId: 'c-mehmet', isOrganizer: false, responseStatus: 'accepted' },
        { name: 'Yunus Emre', email: 'yunus@example.com', isOrganizer: true, responseStatus: 'accepted' },
      ],
      organizerIsUser: true,
      status: 'confirmed',
      providerUpdatedAt: null,
      source: 'google_calendar',
      prepGeneratedAt: null,
      postMeetingHandledAt: null,
      isAiCreated: false,
      createdAt: now,
      updatedAt: now,
    };
    const [ec] = buildMemoryChunks({ source: { kind: 'calendar_event', entity: event }, timezone: tz });
    expect(ec?.content).toBe('Mehmet ile müşteri toplantısı\nNe zaman: 5 Eylül 2026 14:30–15:30\nNerede: Ofis\nKatılımcılar: Mehmet Yılmaz, Yunus Emre\nTeklif v2 ve teslim takvimi');
    expect(ec).toMatchObject({ sourceType: 'google_calendar', topic: 'Mehmet ile müşteri toplantısı', personName: 'Mehmet Yılmaz', contactId: 'c-mehmet', occurredAt: event.startAt });
    expect(buildMemoryChunks({ source: { kind: 'calendar_event', entity: { ...event, status: 'cancelled' } }, timezone: tz })).toEqual([]);

    const commitment: Commitment = { id: 'g1', userId: 'u1', text: "Mehmet'e teklif gönder", quote: 'yarın göndereceğim', direction: 'user_owes', counterpartName: 'Mehmet Yılmaz', counterpartContactId: 'c-mehmet', dueAt: at('2026-09-06', '18:00'), dueText: 'yarın', status: 'open', source: { type: 'meeting_note', id: 'n1', label: 'Toplantı notu', person: 'Mehmet Yılmaz', timestamp: at('2026-09-01', '15:31') }, confidence: 0.9, createdAt: now, updatedAt: now };
    const [cc] = buildMemoryChunks({ source: { kind: 'commitment', entity: commitment }, timezone: tz });
    expect(cc?.content).toBe("Verdiğin söz: Mehmet'e teklif gönder\n“yarın göndereceğim”\nSon tarih: 6 Eylül 2026 18:00 (yarın)");
    expect(cc).toMatchObject({ sourceType: 'meeting_note', personName: 'Mehmet Yılmaz', occurredAt: at('2026-09-01', '15:31') });

    const capture: Capture = { id: 'cap1', userId: 'u1', kind: 'image', status: 'analyzed', extractedText: 'Fatura no 123456 tutar 1.842,00 TL son ödeme 10.09.2026', analysis: { detectedType: 'payment', title: 'Elektrik faturası', summary: 'Elektrik faturası 1.842 TL, son ödeme 10 Eylül.', keyPoints: ['1.842 TL'], dates: [], suggestedActions: [], confidence: 0.9 }, origin: 'in_app', approvalIds: [], createdAt: at('2026-09-03', '12:00'), updatedAt: now };
    const [pc] = buildMemoryChunks({ source: { kind: 'capture', entity: capture }, timezone: tz });
    expect(pc?.content).toContain('Elektrik faturası 1.842 TL, son ödeme 10 Eylül.');
    expect(pc?.content).toContain('Fatura no 123456');
    expect(pc).toMatchObject({ sourceType: 'capture', topic: 'Elektrik faturası', occurredAt: capture.createdAt });

    const note: PostMeetingNote = { id: 'n1', userId: 'u1', eventId: 'd1', text: "Mehmet'e yarın teklif göndereceğim.", inputMode: 'voice', extractedCommitmentIds: [], createdAt: at('2026-09-01', '15:31'), updatedAt: now };
    const [nc] = buildMemoryChunks({ source: { kind: 'meeting_note', entity: note, eventTitle: 'Mehmet ile müşteri toplantısı', personName: 'Mehmet Yılmaz', contactId: 'c-mehmet', eventAt: at('2026-09-01', '14:30') }, timezone: tz });
    expect(nc?.content).toBe("Toplantı: Mehmet ile müşteri toplantısı\nMehmet'e yarın teklif göndereceğim.");
    expect(nc).toMatchObject({ sourceType: 'meeting_note', personName: 'Mehmet Yılmaz', contactId: 'c-mehmet', occurredAt: at('2026-09-01', '14:30') });
    expect(nc?.source.label).toBe('Toplantı notu');
  });
});

describe('memory · full-text query', () => {
  it('drops Turkish stopwords and question particles, keeps phrases and negations', () => {
    expect(buildFtsQuery('Mehmet ile en son ne konuştuk?')).toBe('mehmet son konuştuk');
    expect(buildFtsQuery('Ödemem gereken faturalar mı?')).toBe('ödemem gereken faturalar');
    expect(buildFtsQuery('"fiyat teklifi" -kampanya veya fatura')).toBe('"fiyat teklifi" -kampanya or fatura');
    expect(buildFtsQuery("Mehmet'in teklif maili")).toBe('mehmet teklif maili');
    expect(buildFtsQuery('Geçen ay gelen uçak bileti')).toBe('geçen ay gelen uçak bileti');
  });
  it('balances quotes and returns empty for nothing searchable', () => {
    expect(buildFtsQuery('"teklif')).toBe('teklif');
    expect(buildFtsQuery('"sözleşme taslağı')).toBe('"sözleşme taslağı"');
    expect(buildFtsQuery('ve ile bir')).toBe('');
    expect(buildFtsQuery('-spam')).toBe('');
    expect(buildFtsQuery('')).toBe('');
    expect(buildFtsQuery('or teklif or')).toBe('teklif');
    expect(buildFtsQuery('a & b | (c)')).toBe('b c');
  });
});

describe('memory · context trimming', () => {
  it('ranks by score blended with recency and respects the token budget', () => {
    const chunks = [
      chunk({ id: 'old-high', content: 'a'.repeat(400), score: 0.95, occurredAt: at('2026-06-01', '10:00') }),
      chunk({ id: 'new-mid', content: 'b'.repeat(400), score: 0.6, occurredAt: at('2026-09-05', '07:00') }),
      chunk({ id: 'big', content: 'c'.repeat(4000), score: 0.9, occurredAt: at('2026-09-04', '07:00') }),
      chunk({ id: 'small', content: 'd'.repeat(40), score: 0.3, occurredAt: at('2026-09-01', '07:00') }),
      chunk({ id: 'small', content: 'd'.repeat(40), score: 0.3, occurredAt: at('2026-09-01', '07:00') }),
    ];
    const kept = rankAndTrimContext(chunks, { maxTokens: 250, now });
    expect(kept.map((c) => c.id)).toEqual(['old-high', 'new-mid', 'small']);
    expect(kept.reduce((s, c) => s + c.tokenCount, 0)).toBeLessThanOrEqual(250);
    const recencyOnly = rankAndTrimContext(chunks.map((c) => ({ ...c, score: undefined })), { maxTokens: 10_000, now });
    expect(recencyOnly[0]?.id).toBe('new-mid');
  });
});

describe('memory · grounding', () => {
  const bill = chunk({ id: 'm-bill', content: 'CK Enerji elektrik faturası: 1.842,00 TL, son ödeme tarihi 10 Eylül 2026.' });
  const flight = chunk({ id: 'm-flight', content: 'THY TK2412 uçuşu: İstanbul (IST) → Antalya (AYT), 2026-09-06 09:15–10:30. PNR ABC123. Online check-in açık.' });
  it('extracts and canonicalises facts', () => {
    expect(canonicalNumber('1.842')).toBe('1842');
    expect(canonicalNumber('1.842,00')).toBe('1842');
    expect(canonicalNumber('229,99')).toBe('229.99');
    expect(canonicalNumber('1,842.50')).toBe('1842.5');
    expect(canonicalNumber('3')).toBe('3');
    const facts = extractFacts('Fatura 1.842 TL, son ödeme 10 Eylül saat 14:30, TK2412, %8 indirim, 3 gün.');
    expect(facts.map((f) => [f.kind, f.key])).toEqual([
      ['date', '10-9'],
      ['time', '14:30'],
      ['amount', '1842'],
      ['amount', '8'],
      ['code', 'TK2412'],
      ['number', '3'],
    ]);
  });
  it('accepts answers whose facts are in the cited chunks', () => {
    const res = groundingCheck('Elektrik faturası 1.842 TL, son ödeme 10 Eylül.', ['m-bill'], [bill, flight]);
    expect(res).toEqual({ uncertain: false, unsupportedFacts: [] });
    const res2 = groundingCheck("TK2412 uçuşun yarın 09:15'te kalkıyor, PNR ABC123. 6 Eylül'de Antalya'da olacaksın.", ['m-flight'], [bill, flight]);
    expect(res2).toEqual({ uncertain: false, unsupportedFacts: [] });
  });
  it('flags invented numbers, dates, times and amounts', () => {
    const res = groundingCheck('Fatura 2.000 TL, son ödeme 12 Eylül 14:00; 3 gün kaldı.', ['m-bill'], [bill, flight]);
    expect(res.uncertain).toBe(true);
    expect(res.unsupportedFacts).toEqual(['12 Eylül', '14:00', '2.000 TL', '3']);
    expect(groundingCheck('Uçuş TK2412 saat 10:00.', ['m-bill'], [bill, flight]).unsupportedFacts).toEqual(['10:00', 'TK2412']);
  });
  it('is uncertain without citations (unless the answer is generic) or with unknown citations', () => {
    expect(groundingCheck('Fatura 1.842 TL.', [], [bill])).toEqual({ uncertain: true, unsupportedFacts: ['1.842 TL'] });
    expect(groundingCheck('Teklif gönderildi, yanıt bekleniyor.', [], [bill])).toEqual({ uncertain: false, unsupportedFacts: [] });
    expect(groundingCheck('Fatura 1.842 TL.', ['m-bill', 'ghost'], [bill]).uncertain).toBe(true);
  });
});

describe('memory · source refs and search results', () => {
  it('buildSourceRefs dedupes per source and adds a citation excerpt', () => {
    const a = chunk({ id: 'a', content: 'Birinci parça.\nİkinci satır.', source: { type: 'gmail', id: 'e1', label: 'Gmail', person: 'Ahmet Yılmaz', timestamp: now } });
    const b = chunk({ id: 'b', content: 'Aynı kaynak', source: { type: 'gmail', id: 'e1', label: 'Gmail', timestamp: now } });
    const c = chunk({ id: 'c', content: 'x'.repeat(500), source: { type: 'meeting_note', id: 'n1', label: 'Toplantı notu', timestamp: now, excerpt: 'Hazır alıntı' } });
    const refs = buildSourceRefs([a, b, c]);
    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({ type: 'gmail', id: 'e1', person: 'Ahmet Yılmaz', excerpt: 'Birinci parça. İkinci satır.' });
    expect(refs[1]?.excerpt).toBe('Hazır alıntı');
  });
  it('maps chunks and entities to SearchResult, best first, deduped and limited', () => {
    const contact: Contact = { id: 'c-mehmet', userId: 'u1', displayName: 'Mehmet Yılmaz', emails: ['mehmet@musteri.com'], phones: [], company: 'Müşteri Ltd.', title: 'Genel Müdür', lastContactAt: at('2026-09-01', '15:31'), interactionCount: 42, isVip: true, source: 'communication', createdAt: now, updatedAt: now };
    const t = thread({ id: 'e4', subject: 'Re: Teklif v2', participants: [{ name: 'Mehmet Yılmaz', email: 'mehmet@musteri.com' }], lastMessageAt: at('2026-09-02', '10:15'), analysis: analysis({ summary: "Mehmet'e Teklif v2 gönderildi; geri bildirim bekleniyor." }) });
    const m = chunk({ id: 'm1', content: "Mehmet Yılmaz'a Teklif v2 PDF gönderildi; geri bildirim bekleniyor.", topic: 'Teklif v2', sourceId: 'e4', score: 0.92, occurredAt: at('2026-09-02', '10:15') });
    const dup = chunk({ id: 'm2', content: 'Teklif v2 tekrar', topic: 'Teklif v2', sourceId: 'e4', score: 0.5, occurredAt: at('2026-09-01', '10:15') });
    const results = toSearchResults({ chunks: [m, dup], threads: [t], contacts: [contact] }, { mode: 'semantic', query: 'Mehmet teklif', now, limit: 10 });
    expect(results.map((r) => r.kind)).toEqual(['memory', 'email', 'person']);
    expect(results[0]).toMatchObject({ id: 'memory:m1', title: 'Teklif v2', entityId: 'e4', source: m.source });
    expect(results[1]).toMatchObject({ title: 'Teklif v2', summary: "Mehmet'e Teklif v2 gönderildi; geri bildirim bekleniyor.", entityId: 'e4' });
    expect(results[2]).toMatchObject({ title: 'Mehmet Yılmaz', summary: 'Genel Müdür · Müşteri Ltd.', entityId: 'c-mehmet' });
    for (let i = 1; i < results.length; i++) expect((results[i - 1]?.score ?? 0) >= (results[i]?.score ?? 0)).toBe(true);
    expect(toSearchResults({ chunks: [m, dup], threads: [t] }, { mode: 'fts', query: 'teklif', now, limit: 1 })).toHaveLength(1);
    expect(termOverlap('Mehmet teklif', "Mehmet'e teklifi gönderdim")).toBe(1);
    expect(termOverlap('fatura', 'Teklif v2')).toBe(0);
  });
});
