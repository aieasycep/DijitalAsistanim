import { useEffect, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { qk } from '@da/api-client';
import type { Profile, UserPreferences } from '@da/domain';
import { useDataSource } from '@/hooks/useDataSource';
import { useSessionStore } from '@/store/session';
import { identifyUser } from '@/lib/analytics';
import { captureError, setMonitoringUser } from '@/lib/monitoring';
import { changeLocale } from '@/lib/i18n';
import { startOfflineQueue } from '@/lib/offlineQueue';
import { clearLocalSession } from '@/lib/sessionHygiene';
import { CacheKeys, readCache, writeCache } from '@/lib/storage';
import { androidNotifications } from '@/services/androidNotifications';
import { addProStatusListener, identifyPurchasesUser } from '@/services/purchases';

const PROFILE_CACHE_KEY = 'session.profile.v1';

/**
 * Bootstraps the auth session, profile and preferences; keeps analytics/monitoring identity in sync.
 * Cached profile/preferences are used immediately (offline-first) and refreshed in the background — but only
 * when they belong to the signed-in user, so nothing from a previous account ever surfaces.
 *
 * Once signed in, the per-user device services start: the offline write queue replays queued writes on
 * reconnect, Android notification capture begins (never on iOS), and RevenueCat is logged in as this user so
 * the billing webhook can match the profile. All of it is torn down when the session ends.
 */
export function SessionProvider({ children }: PropsWithChildren) {
  const ds = useDataSource();
  const qc = useQueryClient();
  const setSession = useSessionStore((s) => s.setSession);
  const setProfile = useSessionStore((s) => s.setProfile);
  const setPreferences = useSessionStore((s) => s.setPreferences);
  const status = useSessionStore((s) => s.status);
  const userId = useSessionStore((s) => s.session?.user.id ?? null);

  useEffect(() => {
    let cancelled = false;
    const isCurrentUser = (id: string): boolean =>
      useSessionStore.getState().session?.user.id === id;

    async function loadUser(id: string) {
      const cachedProfile = readCache<Profile>(PROFILE_CACHE_KEY);
      const cachedPrefs = readCache<UserPreferences>(CacheKeys.preferences);
      if (cachedProfile?.id === id) setProfile(cachedProfile);
      if (cachedPrefs?.userId === id) {
        setPreferences(cachedPrefs);
        changeLocale(cachedPrefs.locale);
      }
      try {
        const [profile, prefs] = await Promise.all([
          ds.profile.getProfile(),
          ds.profile.getPreferences(),
        ]);
        // A sign-out can race an in-flight fetch: never repopulate a store / cache that was just wiped.
        if (cancelled || !isCurrentUser(id)) return;
        setProfile(profile);
        setPreferences(prefs);
        changeLocale(prefs.locale);
        writeCache(PROFILE_CACHE_KEY, profile);
        writeCache(CacheKeys.preferences, prefs);
      } catch {
        // offline: keep cached values
      }
    }

    function onSignedIn(id: string) {
      identifyUser(id);
      setMonitoringUser(id);
      void loadUser(id);
    }

    async function bootstrap() {
      const session = await ds.auth.getSession();
      if (cancelled) return;
      setSession(session);
      if (session) onSignedIn(session.user.id);
    }

    void bootstrap();
    const unsub = ds.auth.onAuthStateChange((session) => {
      setSession(session);
      if (session) onSignedIn(session.user.id);
      else
        clearLocalSession(ds, qc).catch((e) =>
          captureError(e, { where: 'SessionProvider.clearLocalSession' }),
        );
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [ds, qc, setPreferences, setProfile, setSession]);

  useEffect(() => {
    if (status !== 'signedIn' || !userId) return undefined;
    let cancelled = false;
    let unsubscribePro: (() => void) | null = null;

    const stopQueue = startOfflineQueue(ds);

    if (Platform.OS === 'android')
      androidNotifications
        .initialize(ds)
        .catch((e) => captureError(e, { where: 'androidNotifications.initialize' }));

    // Store identity is best-effort: a RevenueCat failure must never block sign-in.
    identifyPurchasesUser(userId, ds)
      .then(() => {
        if (cancelled) return;
        unsubscribePro = addProStatusListener(() => {
          void qc.invalidateQueries({ queryKey: qk.entitlement });
        });
      })
      .catch((e) => captureError(e, { where: 'identifyPurchasesUser' }));

    return () => {
      cancelled = true;
      stopQueue();
      unsubscribePro?.();
    };
  }, [ds, qc, status, userId]);

  return children;
}
