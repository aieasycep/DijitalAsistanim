import type { Contact, LearnedPreference, PriorityRule, VipPerson } from '@da/domain';
import {
  CONTACT_AHMET,
  CONTACT_GIRISIM,
  CONTACT_MEHMET,
  CONTACT_SELIN,
  LEARNED_MEHMET,
  LEARNED_PROMOTIONS,
  LEARNED_REMINDER_LEAD,
  RULE_DOMAIN,
  RULE_PROMOTIONS,
  VIP_MEHMET,
} from '../ids';
import type { FixtureContext } from './types';

export function buildContacts(f: FixtureContext): Contact[] {
  const base = {
    userId: f.userId,
    phones: [] as string[],
    avatarUrl: null,
    deletedAt: null,
    source: 'communication' as const,
  };
  return [
    {
      ...base,
      id: CONTACT_AHMET,
      displayName: 'Ahmet Yılmaz',
      emails: ['ahmet@firma.com'],
      company: 'Firma A.Ş.',
      title: 'Satın Alma Müdürü',
      lastContactAt: f.lt(0, '08:42'),
      interactionCount: 18,
      isVip: false,
      createdAt: f.lt(-40, '10:00'),
      updatedAt: f.lt(0, '08:42'),
    },
    {
      ...base,
      id: CONTACT_MEHMET,
      displayName: 'Mehmet Yılmaz',
      emails: ['mehmet@musteri.com'],
      company: 'Müşteri Ltd.',
      title: 'Genel Müdür',
      lastContactAt: f.lt(-4, '15:31'),
      interactionCount: 42,
      isVip: true,
      createdAt: f.lt(-60, '10:00'),
      updatedAt: f.lt(-4, '15:31'),
    },
    {
      ...base,
      id: CONTACT_SELIN,
      displayName: 'Selin Kaya',
      emails: ['selin@hukuk.com'],
      company: 'Kaya Hukuk',
      title: 'Avukat',
      lastContactAt: f.lt(-1, '15:40'),
      interactionCount: 9,
      isVip: false,
      createdAt: f.lt(-30, '10:00'),
      updatedAt: f.lt(-1, '15:40'),
    },
    {
      ...base,
      id: CONTACT_GIRISIM,
      displayName: 'Girişim Programı',
      emails: ['basvuru@girisimprogrami.org'],
      company: 'Girişim Programı',
      title: null,
      lastContactAt: f.lt(-1, '16:10'),
      interactionCount: 3,
      isVip: false,
      createdAt: f.lt(-20, '10:00'),
      updatedAt: f.lt(-1, '16:10'),
    },
  ];
}

export function buildVips(f: FixtureContext): VipPerson[] {
  return [
    {
      id: VIP_MEHMET,
      userId: f.userId,
      contactId: CONTACT_MEHMET,
      displayName: 'Mehmet Yılmaz',
      email: 'mehmet@musteri.com',
      relation: 'Müşteri',
      notifyAlways: true,
      createdAt: f.lt(-3, '09:10'),
      updatedAt: f.lt(-3, '09:10'),
    },
  ];
}

export function buildRules(f: FixtureContext): PriorityRule[] {
  return [
    {
      id: RULE_PROMOTIONS,
      userId: f.userId,
      type: 'promotions_low',
      value: '*',
      label: 'Promosyonlar düşük öncelik',
      enabled: true,
      position: 0,
      createdAt: f.lt(-3, '09:10'),
      updatedAt: f.lt(-3, '09:10'),
    },
    {
      id: RULE_DOMAIN,
      userId: f.userId,
      type: 'domain_important',
      value: 'musteri.com',
      label: 'musteri.com her zaman önemli',
      enabled: true,
      position: 1,
      createdAt: f.lt(-3, '09:11'),
      updatedAt: f.lt(-3, '09:11'),
    },
  ];
}

export function buildLearnedPreferences(f: FixtureContext): LearnedPreference[] {
  return [
    {
      id: LEARNED_MEHMET,
      userId: f.userId,
      kind: 'person_priority',
      statement: 'Mehmet Yılmaz yüksek öncelikli.',
      subjectKey: `contact:${CONTACT_MEHMET}`,
      weight: 0.8,
      evidenceCount: 6,
      enabled: true,
      lastReinforcedAt: f.lt(-1, '18:20'),
      createdAt: f.lt(-3, '09:10'),
      updatedAt: f.lt(-1, '18:20'),
    },
    {
      id: LEARNED_PROMOTIONS,
      userId: f.userId,
      kind: 'category_priority',
      statement: 'Promosyon maillerini genelde açmıyorsun.',
      subjectKey: 'category:promotion',
      weight: -0.7,
      evidenceCount: 14,
      enabled: true,
      lastReinforcedAt: f.lt(-1, '07:05'),
      createdAt: f.lt(-3, '09:30'),
      updatedAt: f.lt(-1, '07:05'),
    },
    {
      id: LEARNED_REMINDER_LEAD,
      userId: f.userId,
      kind: 'reminder_lead_time',
      statement: 'Toplantıları 30 dakika önce hatırlatmayı tercih ediyorsun.',
      subjectKey: 'reminder_lead',
      weight: 0.6,
      evidenceCount: 4,
      enabled: true,
      lastReinforcedAt: f.lt(-2, '13:55'),
      createdAt: f.lt(-3, '12:00'),
      updatedAt: f.lt(-2, '13:55'),
    },
  ];
}
