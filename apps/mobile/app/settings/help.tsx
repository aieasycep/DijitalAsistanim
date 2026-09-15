import { useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Icon, Pressable, Text, useTheme, useToast } from '@da/ui';
import { appVersionLabel, supportEmail, supportMailto, webLinks } from '@/features/settings/links';
import { SettingsRowLink } from '@/features/settings/SettingsRowLink';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { SettingsSection } from '@/features/settings/SettingsSection';
import { openExternal } from '@/lib/openExternal';

interface FaqItem {
  q: string;
  a: string;
}

function isFaqItem(value: unknown): value is FaqItem {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as FaqItem).q === 'string' &&
    typeof (value as FaqItem).a === 'string'
  );
}

/** FAQ entries live in the locale files (`settings.help.faqItems`) so copy stays translatable. */
function readFaq(t: TFunction): FaqItem[] {
  const raw: unknown = t('settings.help.faqItems', { returnObjects: true });
  return Array.isArray(raw) ? raw.filter(isFaqItem) : [];
}

interface FaqRowProps {
  item: FaqItem;
  expanded: boolean;
  onToggle: () => void;
  testID: string;
}

function FaqRow({ item, expanded, onToggle, testID }: FaqRowProps) {
  const theme = useTheme();
  const c = theme.colors;
  return (
    <View>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={item.q}
        accessibilityState={{ expanded }}
        pressScale={1}
        ensureTouchTarget={false}
        style={styles.faqRow}
        testID={testID}
      >
        <Text variant="bodyMedium" style={styles.faqQuestion}>
          {item.q}
        </Text>
        <Icon
          name="expandMore"
          size={20}
          color={c.inkTertiary}
          style={expanded ? styles.chevronOpen : undefined}
        />
      </Pressable>
      {expanded ? (
        <Text variant="secondary" tone="secondary" style={styles.faqAnswer}>
          {item.a}
        </Text>
      ) : null}
    </View>
  );
}

/** Help: FAQ accordion, contact by mail, docs / status / legal links on the web, version. */
export default function HelpScreen() {
  const { t } = useTranslation();
  const toast = useToast();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const faq = useMemo(() => readFaq(t), [t]);

  const open = async (url: string) => {
    const ok = await openExternal(url);
    if (!ok)
      toast.show({
        message: t('settings.help.openFailed'),
        icon: 'conflict',
        iconTone: 'critical',
      });
  };

  const contact = () =>
    open(
      supportMailto(
        t('settings.help.contactSubject'),
        t('settings.help.contactBody', { version: appVersionLabel(), platform: Platform.OS }),
      ),
    );

  return (
    <SettingsScreen
      title={t('settings.help.title')}
      subtitle={t('settings.help.subtitle')}
      testID="help-screen"
    >
      {faq.length > 0 ? (
        <SettingsSection title={t('settings.help.faq')}>
          {faq.map((item, index) => (
            <FaqRow
              key={item.q}
              item={item}
              expanded={openIndex === index}
              onToggle={() => setOpenIndex((prev) => (prev === index ? null : index))}
              testID={`help-faq-${index}`}
            />
          ))}
        </SettingsSection>
      ) : null}

      <SettingsSection title={t('settings.help.links')}>
        <SettingsRowLink
          icon="feedback"
          title={t('settings.help.contact')}
          meta={supportEmail}
          onPress={() => void contact()}
          testID="help-contact"
        />
        <SettingsRowLink
          icon="help"
          title={t('settings.help.docs')}
          onPress={() => void open(webLinks.docs)}
          testID="help-docs"
        />
        <SettingsRowLink
          icon="cloud"
          title={t('settings.help.status')}
          onPress={() => void open(webLinks.status)}
          testID="help-status"
        />
        <SettingsRowLink
          icon="lock"
          title={t('settings.help.privacyPolicy')}
          onPress={() => void open(webLinks.privacy)}
          testID="help-privacy"
        />
        <SettingsRowLink
          icon="file"
          title={t('settings.help.terms')}
          onPress={() => void open(webLinks.terms)}
          testID="help-terms"
        />
      </SettingsSection>

      <Text variant="caption" tone="tertiary" align="center" testID="help-version">
        {t('settings.version', { version: appVersionLabel() })}
      </Text>
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  faqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingVertical: 11,
  },
  faqQuestion: { flex: 1, minWidth: 0 },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
  faqAnswer: { paddingBottom: 14, paddingRight: 32 },
});
