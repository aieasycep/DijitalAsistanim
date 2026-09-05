import type {
  AuditLog,
  NotificationPreferences,
  Profile,
  PushToken,
  Subscription,
  UserPreferences,
} from '@da/domain';
import { ACCOUNT_GMAIL, PUSH_TOKEN_ID, SUBSCRIPTION_ID } from '../ids';
import type { FixtureContext } from './types';

export const REFERRAL_CODE = 'YUNUS7K2';

export function buildProfile(f: FixtureContext): Profile {
  return {
    id: f.userId,
    displayName: f.displayName,
    firstName: f.userName,
    email: f.email,
    avatarUrl: null,
    timezone: f.timeZone,
    locale: 'tr',
    onboardingCompletedAt: f.lt(-3, '09:02'),
    firstAnalysisCompletedAt: f.lt(-3, '09:06'),
    referralCode: REFERRAL_CODE,
    referredByCode: null,
    plan: 'pro',
    createdAt: f.lt(-3, '08:55'),
    updatedAt: f.lt(-3, '09:06'),
  };
}

export function buildPreferences(f: FixtureContext): UserPreferences {
  return {
    userId: f.userId,
    theme: 'system',
    locale: 'tr',
    timezone: f.timeZone,
    briefing: {
      morningTime: '08:00',
      middayEnabled: true,
      middayTime: '13:00',
      eveningEnabled: true,
      eveningTime: '19:00',
      weeklyEnabled: true,
      weeklyDay: 0,
      weeklyTime: '18:00',
      weekendEnabled: true,
      quietDays: [],
    },
    interests: ['work', 'finance', 'travel', 'deadlines'],
    learnFromInteractions: true,
    defaultReminderLeadMinutes: 30,
    retention: '90d',
    analyzeAttachments: true,
    reducedMotion: false,
    hapticsEnabled: true,
    androidNotificationScope: 'selected',
    androidAllowedPackages: ['com.trendyol.app', 'com.yurticikargo.app', 'com.google.android.gm'],
    androidNotificationUploadConsent: false,
    createdAt: f.lt(-3, '08:55'),
    updatedAt: f.lt(-3, '09:02'),
  };
}

export function buildNotificationPreferences(f: FixtureContext): NotificationPreferences {
  return {
    userId: f.userId,
    categories: {
      morning: true,
      midday: true,
      evening: true,
      weekly: true,
      critical_email: true,
      meeting: true,
      deadline: true,
      follow_up: true,
      life_event: true,
      approval: true,
      reminder: true,
    },
    onlyWhenImportant: false,
    quietHoursEnabled: true,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00',
    lockScreenPrivacy: 'title_only',
    meetingLeadMinutes: 20,
    systemPermissionGranted: true,
    createdAt: f.lt(-3, '08:55'),
    updatedAt: f.lt(-3, '09:02'),
  };
}

export function buildPushTokens(f: FixtureContext): PushToken[] {
  return [
    {
      id: PUSH_TOKEN_ID,
      userId: f.userId,
      token: 'ExponentPushToken[demo-device-1]',
      platform: 'ios',
      deviceId: 'demo-device-1',
      deviceName: 'iPhone 16 Pro',
      appVersion: '1.0.0',
      isActive: true,
      lastSeenAt: f.minus(12),
      createdAt: f.lt(-3, '09:02'),
      updatedAt: f.minus(12),
    },
  ];
}

export function buildSubscriptions(f: FixtureContext): Subscription[] {
  return [
    {
      id: SUBSCRIPTION_ID,
      userId: f.userId,
      source: 'demo',
      status: 'active',
      plan: 'pro',
      productId: 'da_pro_annual',
      entitlementId: 'pro',
      startsAt: f.plusDays(-10),
      expiresAt: f.plusDays(355),
      isTrial: false,
      willRenew: true,
      store: 'demo',
      revenuecatAppUserId: null,
      lastEventId: null,
      createdAt: f.plusDays(-10),
      updatedAt: f.plusDays(-10),
    },
  ];
}

export function buildAuditLogs(f: FixtureContext): AuditLog[] {
  return [
    {
      id: '00000000-0000-4000-8000-000000003a01',
      userId: f.userId,
      action: 'oauth.connect',
      actor: 'user',
      targetType: 'connected_account',
      targetId: ACCOUNT_GMAIL,
      metadata: { provider: 'google', kinds: 'email,calendar,tasks' },
      ip: null,
      createdAt: f.lt(-3, '08:58'),
    },
    {
      id: '00000000-0000-4000-8000-000000003a02',
      userId: f.userId,
      action: 'sync.run',
      actor: 'cron',
      targetType: 'connected_account',
      targetId: ACCOUNT_GMAIL,
      metadata: { resource: 'mail', mode: 'polling' },
      ip: null,
      createdAt: f.minus(12),
    },
  ];
}
