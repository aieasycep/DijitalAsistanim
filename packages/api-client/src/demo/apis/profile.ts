import {
  feedbackFormSchema,
  notificationPreferencesUpdateSchema,
  registerPushTokenSchema,
  timezoneSchema,
  userPreferencesUpdateSchema,
  z,
} from '@da/validation';
import type { ProfileApi } from '../../datasource';
import type { DemoContext } from '../context';
import { validate } from '../validate';

const profilePatchSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120),
    firstName: z.string().trim().min(1).max(60),
    timezone: timezoneSchema,
    locale: z.enum(['tr', 'en']),
    avatarUrl: z.string().url().nullable(),
  })
  .partial();

export function createProfileApi(ctx: DemoContext): ProfileApi {
  return {
    getProfile: () => ctx.run(() => ({ ...ctx.store.state.profile })),
    updateProfile: (patch) =>
      ctx.run(() => {
        const clean = validate(profilePatchSchema, patch);
        return ctx.store.mutate((s) => {
          const now = ctx.nowIso();
          if (clean.displayName !== undefined) s.profile.displayName = clean.displayName;
          if (clean.firstName !== undefined) s.profile.firstName = clean.firstName;
          if (clean.timezone !== undefined) {
            s.profile.timezone = clean.timezone;
            s.preferences.timezone = clean.timezone;
          }
          if (clean.locale !== undefined) {
            s.profile.locale = clean.locale;
            s.preferences.locale = clean.locale;
          }
          if (clean.avatarUrl !== undefined) s.profile.avatarUrl = clean.avatarUrl;
          s.profile.updatedAt = now;
          return { ...s.profile };
        });
      }),
    completeOnboarding: () =>
      ctx.run(() =>
        ctx.store.mutate((s) => {
          const now = ctx.nowIso();
          s.profile.onboardingCompletedAt = s.profile.onboardingCompletedAt ?? now;
          s.profile.updatedAt = now;
          return { ...s.profile };
        }),
      ),
    getPreferences: () => ctx.run(() => ({ ...ctx.store.state.preferences })),
    updatePreferences: (patch) =>
      ctx.run(() => {
        const clean = validate(userPreferencesUpdateSchema, patch);
        return ctx.store.mutate((s) => {
          const briefing = clean.briefing
            ? {
                ...s.preferences.briefing,
                ...clean.briefing,
                weeklyDay: clean.briefing.weeklyDay as 0 | 1 | 2 | 3 | 4 | 5 | 6,
              }
            : s.preferences.briefing;
          s.preferences = { ...s.preferences, ...clean, briefing, updatedAt: ctx.nowIso() };
          if (clean.timezone) s.profile.timezone = clean.timezone;
          if (clean.locale) s.profile.locale = clean.locale;
          return { ...s.preferences };
        });
      }),
    getNotificationPreferences: () =>
      ctx.run(() => ({ ...ctx.store.state.notificationPreferences })),
    updateNotificationPreferences: (patch) =>
      ctx.run(() => {
        const clean = validate(notificationPreferencesUpdateSchema, patch);
        return ctx.store.mutate((s) => {
          s.notificationPreferences = {
            ...s.notificationPreferences,
            ...clean,
            categories: { ...s.notificationPreferences.categories, ...(clean.categories ?? {}) },
            updatedAt: ctx.nowIso(),
          };
          return { ...s.notificationPreferences };
        });
      }),
    registerPushToken: (req) =>
      ctx.run(() => {
        const clean = validate(registerPushTokenSchema, req);
        ctx.store.mutate((s) => {
          const now = ctx.nowIso();
          const existing = s.pushTokens.find((t) => t.deviceId === clean.deviceId);
          if (existing) {
            existing.token = clean.token;
            existing.platform = clean.platform;
            existing.deviceName = clean.deviceName ?? existing.deviceName;
            existing.appVersion = clean.appVersion ?? existing.appVersion;
            existing.isActive = true;
            existing.lastSeenAt = now;
            existing.updatedAt = now;
            return;
          }
          s.pushTokens.push({
            id: ctx.nextId(),
            userId: ctx.userId,
            token: clean.token,
            platform: clean.platform,
            deviceId: clean.deviceId,
            deviceName: clean.deviceName ?? null,
            appVersion: clean.appVersion ?? null,
            isActive: true,
            lastSeenAt: now,
            createdAt: now,
            updatedAt: now,
          });
        });
      }),
    unregisterPushToken: (deviceId) =>
      ctx.run(() => {
        ctx.store.mutate((s) => {
          for (const t of s.pushTokens) {
            if (t.deviceId === deviceId) {
              t.isActive = false;
              t.updatedAt = ctx.nowIso();
            }
          }
        });
      }),
    submitFeedback: (input) =>
      ctx.run(() => {
        const clean = validate(feedbackFormSchema, input);
        ctx.store.mutate((s) => {
          s.userFeedback.push({
            id: ctx.nextId(),
            category: clean.category,
            message: clean.message,
            includeDiagnostics: clean.includeDiagnostics,
            appVersion: clean.appVersion ?? null,
            platform: clean.platform === 'web' ? null : (clean.platform ?? null),
            createdAt: ctx.nowIso(),
          });
        });
      }),
  };
}
