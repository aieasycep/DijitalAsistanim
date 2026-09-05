/**
 * Share extension (iOS) / share intent (Android) → Universal Capture.
 *
 * Uses `useShareIntent` from expo-share-intent directly (a single consumer in RootNavigator), so no
 * `ShareIntentProvider` is required. If another screen ever needs live share state, wrap `AppProviders`
 * in `<ShareIntentProvider options={shareIntentOptions()}>` and switch this hook to `useShareIntentContext`
 * — keep exactly one consumer of the native module either way.
 *
 * Flow: intent arrives → mapped to capture items (text / link / image / pdf / file, files > 25 MB or
 * unsupported types flagged) → stored as the pending capture → native state reset → `/capture?source=share`
 * once the session is ready. The capture screen calls `consumePendingShareCapture()`.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useRouter, type Href } from 'expo-router';
import { useShareIntent, type ShareIntentOptions } from 'expo-share-intent';
import { env } from '@/lib/env';
import { captureError } from '@/lib/monitoring';
import { useSessionStore } from '@/store/session';
import { mapShareIntentToCapture, peekPendingShareCapture, setPendingShareCapture, shareIntentSignature } from '@/services/shareCapture';

export { clearPendingShareCapture, consumePendingShareCapture, peekPendingShareCapture } from '@/services/shareCapture';
export type { PendingShareCapture, ShareCaptureItem } from '@/services/shareCapture';

/** The native module is absent in Expo Go, on web and in Jest. */
export function isShareIntentDisabled(): boolean {
  if (Platform.OS === 'web') return true;
  if (process.env.NODE_ENV === 'test') return true;
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

export function shareIntentOptions(): ShareIntentOptions {
  return { disabled: isShareIntentDisabled(), resetOnBackground: false, scheme: env.appScheme, debug: false };
}

export function useShareIntentCapture(): void {
  const router = useRouter();
  const status = useSessionStore((s) => s.status);
  const profile = useSessionStore((s) => s.profile);
  const onboardingCompleted = useSessionStore((s) => s.onboardingCompleted);
  const ready = status === 'signedIn' && (profile === null || onboardingCompleted);

  const options = useMemo(() => shareIntentOptions(), []);
  const { hasShareIntent, shareIntent, resetShareIntent, error } = useShareIntent(options);
  const resetRef = useRef(resetShareIntent);
  const lastSignature = useRef('');
  const navigationPending = useRef(false);

  useEffect(() => {
    resetRef.current = resetShareIntent;
  }, [resetShareIntent]);

  useEffect(() => {
    if (error) captureError(new Error(error), { where: 'useShareIntentCapture' });
  }, [error]);

  useEffect(() => {
    if (!hasShareIntent) return;
    const signature = shareIntentSignature(shareIntent);
    if (signature && signature === lastSignature.current) return;
    lastSignature.current = signature;
    const items = mapShareIntentToCapture(shareIntent);
    resetRef.current();
    if (!items.length) return;
    setPendingShareCapture(items, signature);
    navigationPending.current = true;
  }, [hasShareIntent, shareIntent]);

  useEffect(() => {
    if (!ready || !navigationPending.current || !peekPendingShareCapture()) return;
    navigationPending.current = false;
    try {
      router.push({ pathname: '/capture', params: { source: 'share' } } as Href);
    } catch (e) {
      captureError(e, { where: 'useShareIntentCapture.navigate' });
    }
  }, [ready, hasShareIntent, shareIntent, router]);
}
