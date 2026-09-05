/**
 * Deep-link entry point for the whole app (called once in RootNavigator).
 *  - Handles the launch URL and every `url` event (custom scheme, universal links, dev-client URLs).
 *  - Notification taps, share intents and widgets hand their URLs in through `openDeepLink()`.
 *  - Regular routes wait until the session is signed in and onboarding is complete, then `router.navigate`
 *    (navigate, not push: expo-router may already have linked to the same route, and navigate re-uses it).
 *  - `oauth/<provider>` completes the account connection (works during onboarding).
 *  - `referral?code=` stores the code for the paywall/referral screen, even when signed out.
 *  - `auth/callback` finishes the Supabase PKCE / magic-link sign-in.
 */
import { useCallback, useEffect, useRef } from 'react';
import * as Linking from 'expo-linking';
import { useRouter, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { qk } from '@da/api-client';
import { t } from '@da/i18n';
import { useToast } from '@da/ui';
import { useDataSource } from '@/hooks/useDataSource';
import { useSessionStore } from '@/store/session';
import { track } from '@/lib/analytics';
import { captureError } from '@/lib/monitoring';
import { readCache, removeCache, writeCache } from '@/lib/storage';
import {
  deepLinkKind,
  openDeepLink,
  parseDeepLink,
  setDeepLinkHandler,
  type ParsedDeepLink,
} from '@/services/deeplinks';

export const REFERRAL_PENDING_CACHE_KEY = 'referral.pending.v1';

export interface PendingReferral {
  code: string;
  receivedAt: string;
}

/** Referral code captured from a link before the user could redeem it (consumed by the referral screen). */
export function readPendingReferral(): PendingReferral | null {
  return readCache<PendingReferral>(REFERRAL_PENDING_CACHE_KEY);
}

export function clearPendingReferral(): void {
  removeCache(REFERRAL_PENDING_CACHE_KEY);
}

const DUPLICATE_WINDOW_MS = 1500;
const MAX_DEFERRED = 5;

let initialUrlRequested = false;
let lastHandled: { url: string; at: number } | null = null;
/** Links parsed while the app was not ready for them (signed out / onboarding / OAuth before sign-in). */
const deferred: ParsedDeepLink[] = [];

function defer(link: ParsedDeepLink): void {
  const idx = deferred.findIndex((d) => d.href === link.href);
  if (idx !== -1) deferred.splice(idx, 1);
  deferred.push(link);
  while (deferred.length > MAX_DEFERRED) deferred.shift();
}

function toHref(link: ParsedDeepLink): Href {
  return (link.params ? { pathname: link.href, params: link.params } : link.href) as Href;
}

type AnalyticsProvider = 'google' | 'microsoft' | 'apple' | 'device';
type AnalyticsKind = 'email' | 'calendar' | 'tasks';

export function useDeepLinks(): void {
  const router = useRouter();
  const ds = useDataSource();
  const queryClient = useQueryClient();
  const toast = useToast();
  const status = useSessionStore((s) => s.status);
  const profile = useSessionStore((s) => s.profile);
  const onboardingCompleted = useSessionStore((s) => s.onboardingCompleted);

  const signedIn = status === 'signedIn';
  const ready = signedIn && (profile === null || onboardingCompleted);
  const readyRef = useRef(false);
  const signedInRef = useRef(false);

  useEffect(() => {
    readyRef.current = ready;
    signedInRef.current = signedIn;
  }, [ready, signedIn]);

  const navigate = useCallback(
    (link: ParsedDeepLink) => {
      try {
        router.navigate(toHref(link));
      } catch (e) {
        captureError(e, { where: 'useDeepLinks.navigate', href: link.href });
      }
    },
    [router],
  );

  const completeOAuth = useCallback(
    async (link: ParsedDeepLink) => {
      const p = link.params ?? {};
      const outcome: 'ok' | 'error' = p.status === 'error' ? 'error' : 'ok';
      try {
        const account = await ds.accounts.completeOAuth({
          state: p.state ?? '',
          status: outcome,
          accountId: p.accountId,
          error: p.error,
        });
        await queryClient.invalidateQueries({ queryKey: qk.accounts });
        if (outcome === 'ok' && account) {
          toast.show({
            message: `${account.displayName} · ${t('settings.integrationsScreen.status.active')}`,
            icon: 'check',
            iconTone: 'success',
          });
          const provider: AnalyticsProvider =
            account.provider === 'demo' ? 'google' : account.provider;
          const kind =
            account.kinds.find(
              (k): k is AnalyticsKind => k === 'email' || k === 'calendar' || k === 'tasks',
            ) ?? 'email';
          track('account_connected', { provider, kind });
          if (kind === 'calendar') track('calendar_connected', { provider });
        } else {
          toast.show({ message: t('errors.oauthFailed'), icon: 'warning', iconTone: 'critical' });
        }
      } catch (e) {
        captureError(e, { where: 'useDeepLinks.completeOAuth', provider: p.provider ?? 'unknown' });
        toast.show({ message: t('errors.oauthFailed'), icon: 'warning', iconTone: 'critical' });
      }
    },
    [ds, queryClient, toast],
  );

  const completeAuthCallback = useCallback(
    async (url: string) => {
      try {
        await ds.auth.exchangeCodeForSession(url);
      } catch (e) {
        captureError(e, { where: 'useDeepLinks.authCallback' });
        toast.show({ message: t('errors.oauthFailed'), icon: 'warning', iconTone: 'critical' });
      }
    },
    [ds, toast],
  );

  const dispatch = useCallback(
    (url: string) => {
      const now = Date.now();
      if (lastHandled && lastHandled.url === url && now - lastHandled.at < DUPLICATE_WINDOW_MS)
        return;
      lastHandled = { url, at: now };
      const link = parseDeepLink(url);
      if (!link) return;
      switch (deepLinkKind(link)) {
        case 'auth_callback':
          void completeAuthCallback(url);
          return;
        case 'oauth':
          if (signedInRef.current) void completeOAuth(link);
          else defer(link);
          return;
        case 'referral': {
          const code = link.params?.code;
          if (code)
            writeCache<PendingReferral>(REFERRAL_PENDING_CACHE_KEY, {
              code,
              receivedAt: new Date().toISOString(),
            });
          break;
        }
        default:
          break;
      }
      if (readyRef.current) navigate(link);
      else defer(link);
    },
    [completeAuthCallback, completeOAuth, navigate],
  );

  // Install the process-wide handler (notification taps, share intents and widgets call openDeepLink()).
  useEffect(() => {
    setDeepLinkHandler(dispatch);
    return () => setDeepLinkHandler(null);
  }, [dispatch]);

  // Launch URL (once per process) + live URL events.
  useEffect(() => {
    if (!initialUrlRequested) {
      initialUrlRequested = true;
      Linking.getInitialURL()
        .then((url) => {
          if (url) openDeepLink(url);
        })
        .catch((e: unknown) => captureError(e, { where: 'useDeepLinks.getInitialURL' }));
    }
    const subscription = Linking.addEventListener('url', ({ url }) => openDeepLink(url));
    return () => subscription.remove();
  }, []);

  // Flush deferred links: OAuth returns as soon as there is a session, everything else once onboarding is done.
  useEffect(() => {
    if (!signedIn) return;
    const remaining: ParsedDeepLink[] = [];
    while (deferred.length) {
      const link = deferred.shift();
      if (!link) continue;
      if (deepLinkKind(link) === 'oauth') void completeOAuth(link);
      else if (ready) navigate(link);
      else remaining.push(link);
    }
    deferred.push(...remaining);
  }, [signedIn, ready, completeOAuth, navigate]);
}
