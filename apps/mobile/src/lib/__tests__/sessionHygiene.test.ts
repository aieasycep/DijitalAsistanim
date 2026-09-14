import { Platform } from 'react-native';
import { QueryClient } from '@tanstack/react-query';
import type { DataSource } from '@da/api-client';

jest.mock('@/services/androidNotifications', () => ({
  androidNotifications: { reset: jest.fn(async () => undefined) },
}));
jest.mock('@/services/notifications', () => ({
  cacheNotificationPreferences: jest.fn(),
  cancelAllLocalNotifications: jest.fn(async () => undefined),
  unregisterPushToken: jest.fn(async () => undefined),
}));
jest.mock('@/services/purchases', () => ({ resetPurchasesUser: jest.fn(async () => undefined) }));
jest.mock('@/lib/analytics', () => ({ resetAnalytics: jest.fn() }));
jest.mock('@/lib/monitoring', () => ({ captureError: jest.fn(), setMonitoringUser: jest.fn() }));
jest.mock('@/lib/offlineQueue', () => ({ clear: jest.fn() }));
jest.mock('@/lib/storage', () => ({ wipeLocalData: jest.fn(async () => undefined) }));

import { resetAnalytics } from '@/lib/analytics';
import { captureError, setMonitoringUser } from '@/lib/monitoring';
import { clear as clearOfflineQueue } from '@/lib/offlineQueue';
import { clearLocalSession, detachDeviceFromAccount } from '@/lib/sessionHygiene';
import { wipeLocalData } from '@/lib/storage';
import { androidNotifications } from '@/services/androidNotifications';
import {
  cacheNotificationPreferences,
  cancelAllLocalNotifications,
  unregisterPushToken,
} from '@/services/notifications';
import { resetPurchasesUser } from '@/services/purchases';
import { useSessionStore } from '@/store/session';

function makeDs(): DataSource & { clearLocalState: jest.Mock } {
  return { clearLocalState: jest.fn(async () => undefined) } as unknown as DataSource & {
    clearLocalState: jest.Mock;
  };
}

function signIn(): void {
  useSessionStore.getState().setSession({
    user: { id: 'user-1', provider: 'google' },
    accessToken: 'token',
    expiresAt: '2099-01-01T00:00:00.000Z',
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  signIn();
});

describe('detachDeviceFromAccount', () => {
  it('unregisters the push token and never throws', async () => {
    const ds = makeDs();
    await detachDeviceFromAccount(ds);
    expect(unregisterPushToken).toHaveBeenCalledWith(ds);

    jest.mocked(unregisterPushToken).mockRejectedValueOnce(new Error('network'));
    await expect(detachDeviceFromAccount(ds)).resolves.toBeUndefined();
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
      where: 'sessionHygiene.unregisterPushToken',
    });
  });
});

describe('clearLocalSession', () => {
  it('resets the store and query cache synchronously, then every per-user device state', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'android');
    const ds = makeDs();
    const qc = new QueryClient();
    qc.setQueryData(['today', 'now'], { priorities: [] });

    const run = clearLocalSession(ds, qc);
    expect(useSessionStore.getState().status).toBe('signedOut');
    expect(qc.getQueryData(['today', 'now'])).toBeUndefined();
    await run;

    expect(resetAnalytics).toHaveBeenCalledTimes(1);
    expect(setMonitoringUser).toHaveBeenCalledWith(null);
    expect(clearOfflineQueue).toHaveBeenCalledTimes(1);
    expect(cancelAllLocalNotifications).toHaveBeenCalledTimes(1);
    expect(resetPurchasesUser).toHaveBeenCalledTimes(1);
    expect(androidNotifications.reset).toHaveBeenCalledTimes(1);
    expect(ds.clearLocalState).toHaveBeenCalledTimes(1);
    expect(cacheNotificationPreferences).toHaveBeenCalledWith(null);
    expect(wipeLocalData).toHaveBeenCalledTimes(1);
    expect(captureError).not.toHaveBeenCalled();
    os.restore();
  });

  it('never touches the Android capture service on iOS', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'ios');
    await clearLocalSession(makeDs(), new QueryClient());
    expect(androidNotifications.reset).not.toHaveBeenCalled();
    expect(wipeLocalData).toHaveBeenCalledTimes(1);
    os.restore();
  });

  it('reports a failing step and still runs the rest', async () => {
    jest.mocked(resetPurchasesUser).mockRejectedValueOnce(new Error('store down'));
    const ds = makeDs();
    await clearLocalSession(ds, new QueryClient());
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
      where: 'sessionHygiene.resetPurchasesUser',
    });
    expect(ds.clearLocalState).toHaveBeenCalledTimes(1);
    expect(wipeLocalData).toHaveBeenCalledTimes(1);
  });

  it('shares one run between concurrent callers (auth listener + the screen that signed out)', async () => {
    const ds = makeDs();
    const qc = new QueryClient();
    await Promise.all([clearLocalSession(ds, qc), clearLocalSession(ds, qc)]);
    expect(wipeLocalData).toHaveBeenCalledTimes(1);
    expect(ds.clearLocalState).toHaveBeenCalledTimes(1);

    // A later sign-out runs again from scratch.
    signIn();
    await clearLocalSession(ds, qc);
    expect(wipeLocalData).toHaveBeenCalledTimes(2);
    expect(useSessionStore.getState().status).toBe('signedOut');
  });
});
