import type { AssistantMessage, AssistantThread, MemoryChunk, PostMeetingNote } from '@da/domain';
import {
  ASSISTANT_MSG_FLIGHT_ANSWER,
  ASSISTANT_MSG_FLIGHT_USER,
  ASSISTANT_MSG_FOCUS_ANSWER,
  ASSISTANT_MSG_FOCUS_USER,
  ASSISTANT_THREAD_FLIGHT,
  ASSISTANT_THREAD_FOCUS,
  COMMITMENT_MEHMET_TEKLIF,
  CONTACT_AHMET,
  CONTACT_MEHMET,
  EVENT_MEHMET_MEETING,
  LIFE_THY,
  MEMORY_AHMET_REVIZE,
  MEMORY_CK_FATURA,
  MEMORY_MEHMET_MEETING,
  MEMORY_MEHMET_TEKLIF,
  MEMORY_THY,
  POST_MEETING_NOTE_MEHMET,
  THREAD_AHMET_REVIZE,
  THREAD_CK_FATURA,
  THREAD_MEHMET_TEKLIF_V2,
  THREAD_THY,
} from '../ids';
import { source, type FixtureContext } from './types';

export function buildAssistantThreads(f: FixtureContext): AssistantThread[] {
  return [
    {
      id: ASSISTANT_THREAD_FOCUS,
      userId: f.userId,
      title: 'Bugün neye odaklanmalıyım?',
      lastMessageAt: f.lt(0, '08:50'),
      contactId: null,
      createdAt: f.lt(0, '08:50'),
      updatedAt: f.lt(0, '08:50'),
      deletedAt: null,
    },
    {
      id: ASSISTANT_THREAD_FLIGHT,
      userId: f.userId,
      title: 'Geçen ayki uçak bileti ne kadardı?',
      lastMessageAt: f.lt(-1, '21:10'),
      contactId: null,
      createdAt: f.lt(-1, '21:10'),
      updatedAt: f.lt(-1, '21:10'),
      deletedAt: null,
    },
  ];
}

export function buildAssistantMessages(f: FixtureContext): AssistantMessage[] {
  const base = {
    userId: f.userId,
    approvalIds: [] as string[],
    tokensIn: null,
    tokensOut: null,
    model: 'demo',
  };
  return [
    {
      ...base,
      id: ASSISTANT_MSG_FOCUS_USER,
      threadId: ASSISTANT_THREAD_FOCUS,
      role: 'user',
      content: 'Bugün neye odaklanmalıyım?',
      inputMode: 'text',
      sources: [],
      cards: [],
      uncertain: false,
      createdAt: f.lt(0, '08:50'),
      updatedAt: f.lt(0, '08:50'),
    },
    {
      ...base,
      id: ASSISTANT_MSG_FOCUS_ANSWER,
      threadId: ASSISTANT_THREAD_FOCUS,
      role: 'assistant',
      content:
        "İki şey öne çıkıyor: Ahmet'in 17:00'ye kadar beklediği revize teklif ve 14:30'daki Mehmet toplantısı. Başvuru da 17:00'de kapanıyor.",
      inputMode: 'text',
      sources: [
        source('gmail', THREAD_AHMET_REVIZE, 'Gmail', f.lt(0, '08:42'), { person: 'Ahmet Yılmaz' }),
        source('google_calendar', EVENT_MEHMET_MEETING, 'Google Takvim', f.lt(0, '14:30')),
      ],
      cards: [
        {
          kind: 'email',
          entityId: THREAD_AHMET_REVIZE,
          title: 'Revize teklif',
          subtitle: 'Ahmet Yılmaz · 08:42',
        },
        {
          kind: 'event',
          entityId: EVENT_MEHMET_MEETING,
          title: 'Mehmet ile müşteri toplantısı',
          subtitle: '14:30 · Ofis',
        },
      ],
      uncertain: false,
      createdAt: f.lt(0, '08:50'),
      updatedAt: f.lt(0, '08:50'),
    },
    {
      ...base,
      id: ASSISTANT_MSG_FLIGHT_USER,
      threadId: ASSISTANT_THREAD_FLIGHT,
      role: 'user',
      content: 'Geçen ayki uçak bileti ne kadardı?',
      inputMode: 'text',
      sources: [],
      cards: [],
      uncertain: false,
      createdAt: f.lt(-1, '21:10'),
      updatedAt: f.lt(-1, '21:10'),
    },
    {
      ...base,
      id: ASSISTANT_MSG_FLIGHT_ANSWER,
      threadId: ASSISTANT_THREAD_FLIGHT,
      role: 'assistant',
      content:
        'Biletin tutarı mailde yer almıyor. Bulduğum bilet: TK2412 İstanbul → Antalya, yarın 09:15; PNR ABC123. Kaynakta kesinleşmiyor.',
      inputMode: 'text',
      sources: [source('gmail', THREAD_THY, 'THY', f.lt(-8, '11:20'))],
      cards: [
        {
          kind: 'life_event',
          entityId: LIFE_THY,
          title: 'TK2412 · İstanbul → Antalya',
          subtitle: 'Yarın 09:15 · PNR ABC123',
        },
      ],
      uncertain: true,
      createdAt: f.lt(-1, '21:10'),
      updatedAt: f.lt(-1, '21:10'),
    },
  ];
}

export function buildMemory(f: FixtureContext): MemoryChunk[] {
  const base = { userId: f.userId, hasEmbedding: false, expiresAt: null };
  return [
    {
      ...base,
      id: MEMORY_AHMET_REVIZE,
      sourceType: 'gmail',
      sourceId: THREAD_AHMET_REVIZE,
      source: source('gmail', THREAD_AHMET_REVIZE, 'Gmail', f.lt(0, '08:42'), {
        person: 'Ahmet Yılmaz',
      }),
      content:
        "Ahmet Yılmaz revize fiyat teklifini bugün 17:00'ye kadar PDF olarak istiyor; yönetim toplantısında sunacak.",
      topic: 'Revize teklif',
      personName: 'Ahmet Yılmaz',
      contactId: CONTACT_AHMET,
      occurredAt: f.lt(0, '08:42'),
      tokenCount: 40,
      createdAt: f.lt(0, '08:43'),
      updatedAt: f.lt(0, '08:43'),
    },
    {
      ...base,
      id: MEMORY_MEHMET_TEKLIF,
      sourceType: 'gmail',
      sourceId: THREAD_MEHMET_TEKLIF_V2,
      source: source('gmail', THREAD_MEHMET_TEKLIF_V2, 'Gmail', f.lt(-3, '10:15'), {
        person: 'Mehmet Yılmaz',
      }),
      content:
        "Mehmet Yılmaz'a Teklif v2 PDF gönderildi; geri bildirim bekleniyor. Fiyat ve teslim takvimi güncellendi.",
      topic: 'Teklif v2',
      personName: 'Mehmet Yılmaz',
      contactId: CONTACT_MEHMET,
      occurredAt: f.lt(-3, '10:15'),
      tokenCount: 36,
      createdAt: f.lt(-3, '10:16'),
      updatedAt: f.lt(-3, '10:16'),
    },
    {
      ...base,
      id: MEMORY_THY,
      sourceType: 'gmail',
      sourceId: THREAD_THY,
      source: source('gmail', THREAD_THY, 'THY', f.lt(-8, '11:20')),
      content:
        'THY TK2412 uçuşu: İstanbul (IST) → Antalya (AYT), yarın 09:15–10:30. PNR ABC123. Online check-in açık.',
      topic: 'Uçak bileti',
      personName: 'THY',
      contactId: null,
      occurredAt: f.lt(-8, '11:20'),
      tokenCount: 38,
      createdAt: f.lt(-8, '11:21'),
      updatedAt: f.lt(-8, '11:21'),
    },
    {
      ...base,
      id: MEMORY_CK_FATURA,
      sourceType: 'gmail',
      sourceId: THREAD_CK_FATURA,
      source: source('gmail', THREAD_CK_FATURA, 'Gmail', f.lt(-2, '09:05'), {
        person: 'CK Enerji',
      }),
      content: 'CK Enerji elektrik faturası: 1.842 TL, son ödeme tarihi 10 Eylül.',
      topic: 'Elektrik faturası',
      personName: 'CK Enerji',
      contactId: null,
      occurredAt: f.lt(-2, '09:05'),
      tokenCount: 22,
      createdAt: f.lt(-2, '09:06'),
      updatedAt: f.lt(-2, '09:06'),
    },
    {
      ...base,
      id: MEMORY_MEHMET_MEETING,
      sourceType: 'meeting_note',
      sourceId: POST_MEETING_NOTE_MEHMET,
      source: source('meeting_note', POST_MEETING_NOTE_MEHMET, 'Toplantı notu', f.lt(-4, '15:31'), {
        person: 'Mehmet Yılmaz',
      }),
      content:
        'Mehmet ile müşteri toplantısı sonrası not: yarın teklif gönderilecek. Konuşulanlar: revize fiyat, teslim tarihi, sözleşme maddesi.',
      topic: 'Müşteri toplantısı',
      personName: 'Mehmet Yılmaz',
      contactId: CONTACT_MEHMET,
      occurredAt: f.lt(-4, '15:31'),
      tokenCount: 34,
      createdAt: f.lt(-4, '15:32'),
      updatedAt: f.lt(-4, '15:32'),
    },
  ];
}

export function buildPostMeetingNotes(f: FixtureContext): PostMeetingNote[] {
  return [
    {
      id: POST_MEETING_NOTE_MEHMET,
      userId: f.userId,
      eventId: EVENT_MEHMET_MEETING,
      text: "Mehmet'e yarın teklif göndereceğim.",
      inputMode: 'voice',
      extractedCommitmentIds: [COMMITMENT_MEHMET_TEKLIF],
      createdAt: f.lt(-4, '15:31'),
      updatedAt: f.lt(-4, '15:31'),
    },
  ];
}
