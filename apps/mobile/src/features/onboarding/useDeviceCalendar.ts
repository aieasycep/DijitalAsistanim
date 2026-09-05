/**
 * Device calendar (EventKit / Android provider) for onboarding: request the native permission, register the
 * device calendars as a `apple` / `device` account and upload the next 60 days of events so the backend can
 * reason over them. Nothing is written to the calendar here.
 */
import { useCallback, useState } from 'react';
import { Linking } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { qk } from '@da/api-client';
import type { ConnectedAccount } from '@da/domain';
import { useDataSource } from '@/hooks/useDataSource';
import { track } from '@/lib/analytics';
import { captureError } from '@/lib/monitoring';
import {
  deviceCalendarDisplayName,
  deviceProvider,
  getCalendarPermission,
  listDeviceCalendars,
  registerDeviceCalendarAccount,
  requestCalendarPermission,
  syncDeviceCalendar,
} from '@/services/calendarBridge';
import type { PermissionOutcome } from '@/services/permissions';

export type DeviceCalendarStatus = 'idle' | 'requesting' | 'syncing' | 'granted' | 'denied';

export interface DeviceCalendarResult {
  outcome: PermissionOutcome;
  account: ConnectedAccount | null;
  /** Events uploaded for the sync window (0 unless granted). */
  uploaded: number;
}

const PAST_DAYS = 7;
const FUTURE_DAYS = 60;

export function isDeviceCalendarAccount(account: ConnectedAccount): boolean {
  return (
    !account.deletedAt &&
    (account.provider === 'apple' || account.provider === 'device') &&
    account.kinds.includes('calendar') &&
    (account.status === 'active' || account.status === 'syncing')
  );
}

export function useDeviceCalendar() {
  const ds = useDataSource();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<DeviceCalendarStatus>('idle');
  const [uploaded, setUploaded] = useState(0);

  const invalidate = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.accounts }),
      queryClient.invalidateQueries({ queryKey: ['today'] }),
      queryClient.invalidateQueries({ queryKey: ['events'] }),
      queryClient.invalidateQueries({ queryKey: ['plan'] }),
    ]);
  }, [queryClient]);

  const check = useCallback((): Promise<PermissionOutcome> => getCalendarPermission(), []);

  /** Permission already granted: register the calendars and upload the event window. */
  const registerAndSync = useCallback(async (): Promise<DeviceCalendarResult> => {
    setStatus('syncing');
    try {
      const calendars = await listDeviceCalendars();
      const calendarIds = calendars.map((c) => c.id);
      const account = await registerDeviceCalendarAccount(
        ds,
        calendarIds,
        deviceCalendarDisplayName(),
      );
      const result = await syncDeviceCalendar(ds, account.id, calendarIds, {
        pastDays: PAST_DAYS,
        futureDays: FUTURE_DAYS,
      });
      setUploaded(result.uploaded);
      await invalidate();
      track('calendar_connected', { provider: deviceProvider() });
      setStatus('granted');
      return { outcome: 'granted', account, uploaded: result.uploaded };
    } catch (e) {
      setStatus('idle');
      captureError(e, { where: 'useDeviceCalendar.registerAndSync' });
      throw e;
    }
  }, [ds, invalidate]);

  /** Prompts the system dialog; on grant registers + syncs. */
  const request = useCallback(async (): Promise<DeviceCalendarResult> => {
    setStatus('requesting');
    const outcome = await requestCalendarPermission();
    if (outcome !== 'granted') {
      setStatus(outcome === 'denied' ? 'denied' : 'idle');
      return { outcome, account: null, uploaded: 0 };
    }
    return registerAndSync();
  }, [registerAndSync]);

  /** Demo mode: registers the device calendar account without touching the native calendar. */
  const registerDemo = useCallback(async (): Promise<ConnectedAccount> => {
    const account = await ds.accounts.registerDeviceCalendar({
      provider: deviceProvider(),
      displayName: deviceCalendarDisplayName(),
      calendarIds: [],
    });
    await invalidate();
    return account;
  }, [ds, invalidate]);

  const openSettings = useCallback(async (): Promise<void> => {
    try {
      await Linking.openSettings();
    } catch (e) {
      captureError(e, { where: 'useDeviceCalendar.openSettings' });
    }
  }, []);

  return { status, uploaded, check, request, registerAndSync, registerDemo, openSettings };
}
