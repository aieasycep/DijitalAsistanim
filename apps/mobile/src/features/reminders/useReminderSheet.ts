import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import type { Reminder } from '@da/domain';

export interface ReminderSheetTarget {
  targetType: NonNullable<Reminder['targetType']>;
  targetId: string;
  /** Reminder title shown in the sheet and stored on the reminder. */
  title: string;
  /** Deadline / meeting time when known (drives "30 dk önce" options). */
  dueAt?: string | null;
  /** Optional source label for the sheet header ("Gmail · Ahmet Yılmaz"). */
  sourceLabel?: string | null;
}

/** Opens the transparent `/reminder` sheet with the target encoded as route params. */
export function useReminderSheet() {
  const router = useRouter();
  const openReminderSheet = useCallback(
    (target: ReminderSheetTarget) => {
      router.push({
        pathname: '/reminder',
        params: {
          targetType: target.targetType,
          targetId: target.targetId,
          title: target.title,
          ...(target.dueAt ? { dueAt: target.dueAt } : {}),
          ...(target.sourceLabel ? { sourceLabel: target.sourceLabel } : {}),
        },
      });
    },
    [router],
  );
  return { openReminderSheet };
}
