/**
 * Generic chrome / accessibility copy for the design system. `@da/ui` ships no user-facing literals;
 * the app hands these through `<ThemeProvider labels>` so every primitive speaks the active locale.
 */
import type { TFunction } from 'i18next';
import type { UiLabels } from '@da/ui';

export function uiLabelsFor(t: TFunction): UiLabels {
  return {
    loading: t('common.loading'),
    back: t('common.back'),
    close: t('common.close'),
    share: t('common.share'),
    clear: t('common.clear'),
    play: t('common.play'),
    pause: t('common.pause'),
    openSource: t('common.openSource'),
    conflict: t('common.conflict'),
    approvalCenter: t('common.approvalCenter'),
    profile: t('common.profile'),
  };
}
