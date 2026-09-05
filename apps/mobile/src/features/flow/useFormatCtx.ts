import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { FormatCtx } from '@da/i18n';
import { formatCtx } from '@/lib/i18n';
import { useSessionStore } from '@/store/session';

/** Timezone/locale-aware formatting context: user preferences first, device defaults otherwise. */
export function useFormatCtx(): FormatCtx {
  const { i18n } = useTranslation();
  const timezone = useSessionStore((s) => s.preferences?.timezone ?? s.profile?.timezone ?? null);
  const locale = i18n.language?.startsWith('en') ? 'en' : 'tr';
  return useMemo(
    () => formatCtx({ locale, ...(timezone ? { timezone } : {}) }),
    [locale, timezone],
  );
}
