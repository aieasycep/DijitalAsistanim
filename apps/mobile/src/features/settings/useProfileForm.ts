import { useCallback, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { qk } from '@da/api-client';
import type { Profile } from '@da/domain';
import { useToast } from '@da/ui';
import { useDataSource } from '@/hooks/useDataSource';
import { deviceTimezone } from '@/lib/datasource';
import { describeError } from '@/lib/errors';
import { CacheKeys, writeCache } from '@/lib/storage';
import { useSessionStore } from '@/store/session';

/** Same key SessionProvider / onboarding use for the offline profile copy. */
export const PROFILE_CACHE_KEY = 'session.profile.v1';
export const MAX_NAME_LENGTH = 120;

export interface ProfileFormValues {
  displayName: string;
  timezone: string;
}

export interface UseProfileFormResult {
  profile: Profile | null;
  values: ProfileFormValues;
  initial: ProfileFormValues;
  dirty: boolean;
  nameError: string | null;
  canSave: boolean;
  isSaving: boolean;
  setDisplayName: (name: string) => void;
  setTimezone: (tz: string) => void;
  save: () => Promise<Profile | undefined>;
  reset: () => void;
}

export function firstNameOf(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? '';
}

/** Draft state + save mutation for the profile screen (name → displayName/firstName, timezone). */
export function useProfileForm(): UseProfileFormResult {
  const ds = useDataSource();
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation();
  const profile = useSessionStore((s) => s.profile);
  const preferences = useSessionStore((s) => s.preferences);
  const setProfile = useSessionStore((s) => s.setProfile);
  const setPreferences = useSessionStore((s) => s.setPreferences);
  const [draft, setDraft] = useState<Partial<ProfileFormValues>>({});

  const initial: ProfileFormValues = {
    displayName: profile?.displayName ?? '',
    timezone: profile?.timezone ?? preferences?.timezone ?? deviceTimezone(),
  };
  const values: ProfileFormValues = {
    displayName: draft.displayName ?? initial.displayName,
    timezone: draft.timezone ?? initial.timezone,
  };
  const trimmedName = values.displayName.trim();
  const dirty = trimmedName !== initial.displayName || values.timezone !== initial.timezone;
  const nameError =
    trimmedName.length === 0
      ? t('settings.profileScreen.nameRequired')
      : trimmedName.length > MAX_NAME_LENGTH
        ? t('settings.profileScreen.nameRequired')
        : null;

  const mutation = useMutation({
    mutationFn: () => {
      const patch: Parameters<typeof ds.profile.updateProfile>[0] = {};
      if (trimmedName !== initial.displayName) {
        patch.displayName = trimmedName;
        patch.firstName = firstNameOf(trimmedName);
      }
      if (values.timezone !== initial.timezone) patch.timezone = values.timezone;
      return ds.profile.updateProfile(patch);
    },
    onSuccess: (updated) => {
      setProfile(updated);
      writeCache(PROFILE_CACHE_KEY, updated);
      qc.setQueryData(qk.profile, updated);
      const prefs = useSessionStore.getState().preferences;
      if (prefs && prefs.timezone !== updated.timezone) {
        const next = { ...prefs, timezone: updated.timezone };
        setPreferences(next);
        writeCache(CacheKeys.preferences, next);
        qc.setQueryData(qk.preferences, next);
      }
      setDraft({});
      toast.show({ message: t('settings.profileScreen.saved'), icon: 'check' });
    },
    onError: (e) =>
      toast.show({ message: describeError(e, t).title, icon: 'conflict', iconTone: 'critical' }),
  });
  const { mutateAsync } = mutation;

  const save = useCallback(() => mutateAsync().catch(() => undefined), [mutateAsync]);
  const setDisplayName = useCallback(
    (displayName: string) => setDraft((d) => ({ ...d, displayName })),
    [],
  );
  const setTimezone = useCallback((timezone: string) => setDraft((d) => ({ ...d, timezone })), []);
  const reset = useCallback(() => setDraft({}), []);

  return {
    profile,
    values,
    initial,
    dirty,
    nameError,
    canSave: dirty && nameError === null && !mutation.isPending,
    isSaving: mutation.isPending,
    setDisplayName,
    setTimezone,
    save,
    reset,
  };
}
