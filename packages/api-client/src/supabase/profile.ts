/** ProfileApi: profiles / user_preferences / notification_preferences / push_tokens / feedback_submissions. */
import type { NotificationPreferences, Profile, UserPreferences } from '@da/domain';
import type { ProfileApi } from '../datasource';
import { exec, read, write, type SupabaseContext } from './client';
import {
  feedbackToRow,
  notificationPreferencesPatchToRow,
  profilePatchToRow,
  pushTokenToRow,
  toNotificationPreferences,
  toProfile,
  toUserPreferences,
  userPreferencesPatchToRow,
} from './mappers';
import type {
  FeedbackSubmissionRow,
  NotificationPreferencesRow,
  ProfileRow,
  PushTokenRow,
  UserPreferencesRow,
} from './rows';

export function createProfileApi(ctx: SupabaseContext): ProfileApi {
  const profiles = () => ctx.table<ProfileRow>('profiles');
  const preferences = () => ctx.table<UserPreferencesRow>('user_preferences');
  const notifications = () => ctx.table<NotificationPreferencesRow>('notification_preferences');
  const pushTokens = () => ctx.table<PushTokenRow>('push_tokens');

  async function loadProfile(userId: string): Promise<Profile> {
    return toProfile(await exec(profiles().select('*').eq('id', userId).single()));
  }

  /** Preference rows are created by the auth trigger; upsert covers users created before that trigger existed. */
  async function loadPreferences(userId: string): Promise<UserPreferences> {
    const row = await exec(preferences().select('*').eq('user_id', userId).maybeSingle());
    if (row) return toUserPreferences(row);
    return toUserPreferences(
      await exec(
        preferences().upsert({ user_id: userId }, { onConflict: 'user_id' }).select('*').single(),
      ),
    );
  }

  async function loadNotificationPreferences(userId: string): Promise<NotificationPreferences> {
    const row = await exec(notifications().select('*').eq('user_id', userId).maybeSingle());
    if (row) return toNotificationPreferences(row);
    return toNotificationPreferences(
      await exec(
        notifications().upsert({ user_id: userId }, { onConflict: 'user_id' }).select('*').single(),
      ),
    );
  }

  return {
    getProfile: () => read(async () => loadProfile(await ctx.requireUserId())),

    updateProfile: (patch) =>
      write(async () => {
        const userId = await ctx.requireUserId();
        const row = profilePatchToRow(patch);
        if (Object.keys(row).length === 0) return loadProfile(userId);
        return toProfile(await exec(profiles().update(row).eq('id', userId).select('*').single()));
      }),

    completeOnboarding: () =>
      write(async () => {
        const userId = await ctx.requireUserId();
        await exec(
          profiles()
            .update({ onboarding_completed_at: ctx.now().toISOString() })
            .eq('id', userId)
            .is('onboarding_completed_at', null),
        );
        return loadProfile(userId);
      }),

    getPreferences: () => read(async () => loadPreferences(await ctx.requireUserId())),

    updatePreferences: (patch) =>
      write(async () => {
        const userId = await ctx.requireUserId();
        const row = await exec(
          preferences()
            .upsert(
              { user_id: userId, ...userPreferencesPatchToRow(patch) },
              { onConflict: 'user_id' },
            )
            .select('*')
            .single(),
        );
        return toUserPreferences(row);
      }),

    getNotificationPreferences: () =>
      read(async () => loadNotificationPreferences(await ctx.requireUserId())),

    updateNotificationPreferences: (patch) =>
      write(async () => {
        const userId = await ctx.requireUserId();
        const row = await exec(
          notifications()
            .upsert(
              { user_id: userId, ...notificationPreferencesPatchToRow(patch) },
              { onConflict: 'user_id' },
            )
            .select('*')
            .single(),
        );
        return toNotificationPreferences(row);
      }),

    registerPushToken: (req) =>
      write(async () => {
        const userId = await ctx.requireUserId();
        await exec(
          pushTokens().upsert(pushTokenToRow(userId, req, ctx.now()), {
            onConflict: 'user_id,device_id',
          }),
        );
      }),

    unregisterPushToken: (deviceId) =>
      write(async () => {
        const userId = await ctx.requireUserId();
        await exec(
          pushTokens().update({ is_active: false }).eq('user_id', userId).eq('device_id', deviceId),
        );
      }),

    submitFeedback: (input) =>
      write(async () => {
        const userId = await ctx.requireUserId();
        const diagnostics = {
          locale: ctx.locale,
          timezone: ctx.timezone,
          appVersion: input.appVersion ?? null,
          platform: input.platform ?? null,
          submittedAt: ctx.now().toISOString(),
        };
        await exec(
          ctx
            .table<FeedbackSubmissionRow>('feedback_submissions')
            .insert(feedbackToRow(userId, input, diagnostics)),
        );
      }),
  };
}
