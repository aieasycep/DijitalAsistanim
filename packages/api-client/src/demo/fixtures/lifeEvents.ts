import type { LifeEvent } from '@da/domain';
import {
  LIFE_CK_FATURA,
  LIFE_GOOGLE_SECURITY,
  LIFE_NETFLIX,
  LIFE_THY,
  LIFE_TRENDYOL,
  THREAD_CK_FATURA,
  THREAD_GOOGLE_SECURITY,
  THREAD_NETFLIX,
  THREAD_THY,
  THREAD_TRENDYOL,
} from '../ids';
import { source, type FixtureContext } from './types';

export const TRACKING_URL =
  'https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code=1234567890123';
export const CHECK_IN_URL = 'https://www.turkishairlines.com/tr-tr/ucak-bileti/online-check-in/';
export const PAYMENT_URL = 'https://www.ckbogazicielektrik.com.tr/online-islemler';
export const SECURITY_URL = 'https://myaccount.google.com/notifications';

export function buildLifeEvents(f: FixtureContext): LifeEvent[] {
  const base = { userId: f.userId, deletedAt: null };
  return [
    {
      ...base,
      id: LIFE_TRENDYOL,
      type: 'shipment',
      title: 'Trendyol siparişin bugün geliyor.',
      details: {
        carrier: 'Yurtiçi Kargo',
        merchant: 'Trendyol',
        trackingNumber: '1234567890123',
        trackingUrl: TRACKING_URL,
        deliveryWindow: { start: f.lt(0, '14:00'), end: f.lt(0, '18:00') },
      },
      eventAt: f.lt(0, '14:00'),
      status: 'today',
      source: source('gmail', THREAD_TRENDYOL, 'Kargo', f.lt(-1, '19:02'), { person: 'Yurtiçi' }),
      confidence: 0.93,
      dedupeKey: 'life:shipment:1234567890123',
      createdAt: f.lt(-1, '19:05'),
      updatedAt: f.lt(0, '06:00'),
    },
    {
      ...base,
      id: LIFE_THY,
      type: 'flight',
      title: 'TK2412 · İstanbul → Antalya',
      details: {
        flightNumber: 'TK2412',
        airline: 'THY',
        from: 'İstanbul (IST)',
        to: 'Antalya (AYT)',
        departureAt: f.lt(1, '09:15'),
        arrivalAt: f.lt(1, '10:30'),
        pnr: 'ABC123',
        checkInUrl: CHECK_IN_URL,
      },
      eventAt: f.lt(1, '09:15'),
      status: 'upcoming',
      source: source('gmail', THREAD_THY, 'THY', f.lt(-8, '11:20'), {
        person: 'Rezervasyon maili',
      }),
      confidence: 0.95,
      dedupeKey: 'life:flight:TK2412',
      createdAt: f.lt(-8, '11:25'),
      updatedAt: f.lt(0, '06:00'),
    },
    {
      ...base,
      id: LIFE_CK_FATURA,
      type: 'payment',
      title: 'Elektrik faturası · 1.842 TL',
      details: {
        payee: 'CK Enerji',
        amount: 1842,
        currency: 'TRY',
        dueAt: f.lt(5, '23:59'),
        paymentUrl: PAYMENT_URL,
      },
      eventAt: f.lt(5, '23:59'),
      status: 'upcoming',
      source: source('gmail', THREAD_CK_FATURA, 'Gmail', f.lt(-2, '09:05'), {
        person: 'CK Enerji',
      }),
      confidence: 0.9,
      dedupeKey: 'life:payment:ck-eylul',
      createdAt: f.lt(-2, '09:10'),
      updatedAt: f.lt(-2, '09:10'),
    },
    {
      ...base,
      id: LIFE_NETFLIX,
      type: 'subscription',
      title: 'Netflix yenilenecek',
      details: {
        serviceName: 'Netflix',
        renewsAt: f.lt(4, '00:00'),
        amount: 229.99,
        currency: 'TRY',
      },
      eventAt: f.lt(4, '00:00'),
      status: 'upcoming',
      source: source('gmail', THREAD_NETFLIX, 'Gmail', f.lt(-3, '07:30'), { person: 'Netflix' }),
      confidence: 0.9,
      dedupeKey: 'life:subscription:netflix',
      createdAt: f.lt(-3, '07:35'),
      updatedAt: f.lt(-3, '07:35'),
    },
    {
      ...base,
      id: LIFE_GOOGLE_SECURITY,
      type: 'security',
      title: 'Google hesabında yeni giriş.',
      details: { securityEvent: 'Yeni cihazdan giriş', device: 'Windows', location: 'Ankara' },
      eventAt: f.lt(0, '06:12'),
      status: 'today',
      source: source('gmail', THREAD_GOOGLE_SECURITY, 'Gmail', f.lt(0, '06:12'), {
        person: 'Google',
        url: SECURITY_URL,
      }),
      confidence: 0.97,
      dedupeKey: 'life:security:google-1',
      createdAt: f.lt(0, '06:14'),
      updatedAt: f.lt(0, '06:14'),
    },
  ];
}
