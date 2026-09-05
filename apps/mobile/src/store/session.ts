import { create } from 'zustand';
import type { AuthSession } from '@da/api-client';
import type { EntitlementState, Profile, UserPreferences } from '@da/domain';

export type SessionStatus = 'loading' | 'signedOut' | 'signedIn';

interface SessionState {
  status: SessionStatus;
  session: AuthSession | null;
  profile: Profile | null;
  preferences: UserPreferences | null;
  entitlement: EntitlementState | null;
  onboardingCompleted: boolean;
  setSession: (s: AuthSession | null) => void;
  setProfile: (p: Profile | null) => void;
  setPreferences: (p: UserPreferences | null) => void;
  setEntitlement: (e: EntitlementState | null) => void;
  setOnboardingCompleted: (v: boolean) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  status: 'loading',
  session: null,
  profile: null,
  preferences: null,
  entitlement: null,
  onboardingCompleted: false,
  setSession: (session) => set({ session, status: session ? 'signedIn' : 'signedOut' }),
  setProfile: (profile) =>
    set({ profile, onboardingCompleted: Boolean(profile?.onboardingCompletedAt) }),
  setPreferences: (preferences) => set({ preferences }),
  setEntitlement: (entitlement) => set({ entitlement }),
  setOnboardingCompleted: (onboardingCompleted) => set({ onboardingCompleted }),
  reset: () =>
    set({
      status: 'signedOut',
      session: null,
      profile: null,
      preferences: null,
      entitlement: null,
      onboardingCompleted: false,
    }),
}));

export const selectIsPro = (s: SessionState): boolean => Boolean(s.entitlement?.isPro);
export const selectFirstName = (s: SessionState): string =>
  s.profile?.firstName || s.profile?.displayName?.split(' ')[0] || '';
