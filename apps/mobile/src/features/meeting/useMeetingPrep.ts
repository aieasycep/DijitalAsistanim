import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '@da/api-client';
import type { MeetingPrep } from '@da/domain';
import { useDataSource } from '@/hooks/useDataSource';

/** Meeting prep (cached per event) + "Yeniden Hazırla" regeneration. */
export function useMeetingPrep(eventId: string | undefined, enabled: boolean) {
  const ds = useDataSource();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: qk.meetingPrep(eventId ?? ''),
    queryFn: () => ds.meetings.getMeetingPrep(eventId ?? ''),
    enabled: Boolean(eventId) && enabled,
    staleTime: 10 * 60_000,
  });
  const regenerate = useMutation({
    mutationFn: () => ds.meetings.getMeetingPrep(eventId ?? '', { regenerate: true }),
    onSuccess: (prep) => queryClient.setQueryData<MeetingPrep>(qk.meetingPrep(eventId ?? ''), prep),
  });
  return { ...query, prep: query.data, regenerate };
}

/** Minutes until `startAt`, re-evaluated every minute (negative once the meeting started). */
export function useMinutesUntil(startAt: string | undefined): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  if (!startAt) return null;
  return Math.round((Date.parse(startAt) - now) / 60_000);
}
