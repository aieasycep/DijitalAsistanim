import { useTranslation } from 'react-i18next';
import { LOCALES, type Locale } from '@da/domain';
import { useToast } from '@da/ui';
import { RadioRow } from '@/features/settings/RadioRow';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { SettingsSection } from '@/features/settings/SettingsSection';
import { usePreferences } from '@/features/settings/usePreferences';
import { changeLocale } from '@/lib/i18n';

/** App + AI output language. Switches i18next immediately, persists through preferences. */
export default function LanguageScreen() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { preferences, update, isSaving } = usePreferences();
  const current: Locale = preferences?.locale ?? (i18n.language.startsWith('en') ? 'en' : 'tr');

  const select = async (locale: Locale) => {
    if (locale === current || isSaving) return;
    changeLocale(locale);
    const updated = await update({ locale });
    if (!updated) {
      changeLocale(current);
      return;
    }
    toast.show({ message: t('settings.languageScreen.changed'), icon: 'check' });
  };

  return (
    <SettingsScreen title={t('settings.language')} testID="language-screen">
      <SettingsSection
        note={`${t('settings.languageScreen.note')} ${t('settings.languageScreen.briefingNote')}`}
      >
        {LOCALES.map((locale) => (
          <RadioRow
            key={locale}
            title={t(`settings.languageScreen.${locale}`)}
            selected={current === locale}
            onPress={() => void select(locale)}
            testID={`language-${locale}`}
          />
        ))}
      </SettingsSection>
    </SettingsScreen>
  );
}
