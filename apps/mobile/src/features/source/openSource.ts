/**
 * "Kaynağı Gör": every SourceRef resolves to the screen that shows the original — email detail, the
 * event's prep screen, the meeting note, a capture, a life event — or, for provider-only sources, to the
 * provider's own app/web view.
 */
import { useCallback } from 'react';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { SourceRef } from '@da/domain';
import { useToast } from '@da/ui';
import { openExternal } from '@/lib/openExternal';

export function routeForSource(source: SourceRef): Href | null {
  switch (source.type) {
    case 'gmail':
    case 'outlook':
      return { pathname: '/email/[id]', params: { id: source.id } };
    case 'google_calendar':
    case 'microsoft_calendar':
    case 'apple_calendar':
    case 'device_calendar':
      return { pathname: '/meeting/[id]/prep', params: { id: source.id } };
    case 'meeting_note':
      return { pathname: '/meeting/[id]/post', params: { id: source.id } };
    case 'capture':
      return { pathname: '/capture', params: { id: source.id } };
    case 'google_tasks':
    case 'microsoft_todo':
    case 'apple_reminders':
      return { pathname: '/(tabs)/plan' };
    case 'android_notification':
      return { pathname: '/settings/android-notifications' };
    case 'assistant':
      return { pathname: '/(tabs)/assistant' };
    case 'user':
      // Things the user entered themselves: a contact (→ person page) or a manual task/commitment (→ Plan).
      if (source.personId) return { pathname: '/person/[id]', params: { id: source.personId } };
      return { pathname: '/(tabs)/plan' };
  }
}

export function useOpenSource() {
  const router = useRouter();
  const toast = useToast();
  const { t } = useTranslation();
  const openSource = useCallback(
    async (source: SourceRef): Promise<boolean> => {
      const href = routeForSource(source);
      if (href) {
        router.push(href);
        return true;
      }
      if (source.url) {
        const opened = await openExternal(source.url);
        if (opened) return true;
      }
      // Never a silent tap: say why nothing opened.
      toast.show({ message: t('common.sourceUnavailable'), icon: 'info' });
      return false;
    },
    [router, toast, t],
  );
  return { openSource };
}
