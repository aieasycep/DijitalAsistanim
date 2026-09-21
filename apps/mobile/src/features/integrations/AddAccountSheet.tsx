/**
 * "Hesap Ekle" sheet: Gmail / Outlook / Google Takvim / Microsoft Takvim through OAuth (read scopes only —
 * write scopes are granted later per account) and the device calendar (EventKit / Android provider).
 */
import { Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BottomSheet, ListGroup, SheetRow } from '@da/ui';
import type { OAuthTarget } from '@/features/onboarding/useOAuthConnect';

export type AddAccountChoice = OAuthTarget | 'device';

export interface AddAccountSheetProps {
  visible: boolean;
  /** Which choice is currently connecting (locks the rows). */
  connecting: AddAccountChoice | null;
  /** Hide the device-calendar row when it is already registered. */
  hasDeviceCalendar: boolean;
  onClose: () => void;
  onPick: (choice: AddAccountChoice) => void;
}

const OAUTH_CHOICES: { key: OAuthTarget; icon: 'mail' | 'event' }[] = [
  { key: 'gmail', icon: 'mail' },
  { key: 'outlook', icon: 'mail' },
  { key: 'google_calendar', icon: 'event' },
  { key: 'microsoft_calendar', icon: 'event' },
];

export function AddAccountSheet({
  visible,
  connecting,
  hasDeviceCalendar,
  onClose,
  onPick,
}: AddAccountSheetProps) {
  const { t } = useTranslation();
  const deviceKey = Platform.OS === 'ios' ? 'apple_calendar' : 'device_calendar';
  const locked = connecting !== null;
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('settings.integrationsScreen.add')}
      subtitle={t('settings.integrationsScreen.addSubtitle')}
      closeLabel={t('common.close')}
      testID="integrations-add-sheet"
    >
      <ListGroup padding={{ horizontal: 12, vertical: 2 }}>
        {[
          ...OAUTH_CHOICES.map((choice) => (
            <SheetRow
              key={choice.key}
              icon={choice.icon}
              label={t(`settings.integrationsScreen.providers.${choice.key}`)}
              value={t(`onboarding.connect.providerMeta.${choice.key}`)}
              onPress={() => onPick(choice.key)}
              disabled={locked && connecting !== choice.key}
              testID={`integrations-add-${choice.key}`}
            />
          )),
          ...(hasDeviceCalendar
            ? []
            : [
                <SheetRow
                  key="device"
                  icon="event"
                  label={t(`settings.integrationsScreen.providers.${deviceKey}`)}
                  value={t('settings.integrationsScreen.deviceCalendar')}
                  onPress={() => onPick('device')}
                  disabled={locked && connecting !== 'device'}
                  testID="integrations-add-device"
                />,
              ]),
        ]}
      </ListGroup>
    </BottomSheet>
  );
}
