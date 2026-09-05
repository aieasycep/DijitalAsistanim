import { useEffect, type PropsWithChildren } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDataSource } from '@/hooks/useDataSource';
import { useSessionStore } from '@/store/session';
import { identifyUser, resetAnalytics } from '@/lib/analytics';
import { setMonitoringUser } from '@/lib/monitoring';
import { changeLocale } from '@/lib/i18n';
import { CacheKeys, readCache, writeCache } from '@/lib/storage';
import type { Profile, UserPreferences } from '@da/domain';

/**
 * Bootstraps the auth session, profile and preferences; keeps analytics/monitoring identity in sync.
 * Cached profile/preferences are used immediately (offline-first) and refreshed in the background.
 */
export function SessionProvider({ children }: PropsWithChildren) {
  const ds = useDataSource();
  const qc = useQueryClient();
  const { setSession, setProfile, setPreferences, reset } = useSessionStore();

  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      const cachedProfile = readCache<Profile>('session.profile.v1');
      const cachedPrefs = readCache<UserPreferences>(CacheKeys.preferences);
      if (cachedProfile) setProfile(cachedProfile);
      if (cachedPrefs) {
        setPreferences(cachedPrefs);
        changeLocale(cachedPrefs.locale);
      }
      try {
        const [profile, prefs] = await Promise.all([
          ds.profile.getProfile(),
          ds.profile.getPreferences(),
        ]);
        if (cancelled) return;
        setProfile(profile);
        setPreferences(prefs);
        changeLocale(prefs.locale);
        writeCache('session.profile.v1', profile);
        writeCache(CacheKeys.preferences, prefs);
      } catch {
        // offline: keep cached values
      }
    }

    async function bootstrap() {
      const session = await ds.auth.getSession();
      if (cancelled) return;
      setSession(session);
      if (session) {
        identifyUser(session.user.id);
        setMonitoringUser(session.user.id);
        await loadUser();
      }
    }

    void bootstrap();
    const unsub = ds.auth.onAuthStateChange((session) => {
      setSession(session);
      if (session) {
        identifyUser(session.user.id);
        setMonitoringUser(session.user.id);
        void loadUser();
      } else {
        reset();
        resetAnalytics();
        setMonitoringUser(null);
        qc.clear();
      }
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [ds, qc, reset, setPreferences, setProfile, setSession]);

  return children;
}
