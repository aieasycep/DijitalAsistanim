import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { qk } from '@da/api-client';
import type { Contact, VipPerson } from '@da/domain';
import {
  Avatar,
  Button,
  Icon,
  IconButton,
  ListGroup,
  ListGroupTitle,
  ListRow,
  Screen,
  ScreenHeader,
  SearchBar,
  Text,
  TextField,
  useTheme,
  useToast,
} from '@da/ui';
import { useDataSource } from '@/hooks/useDataSource';
import { describeError } from '@/lib/errors';
import { pickDeviceContact, primaryEmail, requestContactsPermission } from '@/services/contacts';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const SEARCH_LIMIT = 20;
const SUGGESTED_LIMIT = 6;

function useDebounced(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** "Kimlerden gelen şeyleri asla kaçırmak istemezsin?" — VIPs from contacts, address book or an e-mail. */
export default function VipScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const ds = useDataSource();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [emailForm, setEmailForm] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const debounced = useDebounced(query.trim(), 250);
  const c = theme.colors;

  const contactsQuery = useQuery({
    queryKey: qk.contacts(debounced),
    queryFn: () => ds.people.listContacts({ query: debounced || undefined, limit: SEARCH_LIMIT }),
  });
  const vipsQuery = useQuery({ queryKey: qk.vips, queryFn: () => ds.people.listVips() });
  const vips = useMemo(() => vipsQuery.data ?? [], [vipsQuery.data]);
  const vipContactIds = useMemo(
    () => new Set(vips.map((v) => v.contactId).filter((id): id is string => Boolean(id))),
    [vips],
  );

  const invalidate = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.vips }),
        queryClient.invalidateQueries({ queryKey: ['contacts'] }),
      ]),
    [queryClient],
  );

  const add = useMutation({
    mutationFn: (input: {
      contactId?: string | null;
      displayName: string;
      email?: string | null;
    }) => ds.people.addVip({ ...input, notifyAlways: true }),
    onSuccess: async (vip) => {
      await invalidate();
      toast.show({
        message: t('onboarding.vip.added', { name: vip.displayName }),
        icon: 'vip',
        iconTone: 'primary',
      });
    },
    onError: (e) =>
      toast.show({ message: describeError(e, t).title, icon: 'warning', iconTone: 'critical' }),
  });

  const remove = useMutation({
    mutationFn: (vip: VipPerson) => ds.people.removeVip(vip.id),
    onSuccess: async (_r, vip) => {
      await invalidate();
      toast.show({
        message: t('onboarding.vip.removed', { name: vip.displayName }),
        icon: 'check',
      });
    },
    onError: (e) =>
      toast.show({ message: describeError(e, t).title, icon: 'warning', iconTone: 'critical' }),
  });

  const addContact = useCallback(
    (contact: Contact) =>
      add.mutate({
        contactId: contact.id,
        displayName: contact.displayName,
        email: contact.emails[0] ?? null,
      }),
    [add],
  );

  const fromAddressBook = useCallback(async () => {
    const permission = await requestContactsPermission();
    if (permission !== 'granted') {
      toast.show({ message: t('errors.permissionDenied'), icon: 'warning', iconTone: 'critical' });
      return;
    }
    const picked = await pickDeviceContact();
    if (!picked || !picked.displayName) return;
    add.mutate({ contactId: null, displayName: picked.displayName, email: primaryEmail(picked) });
  }, [add, toast, t]);

  const submitEmail = useCallback(() => {
    const address = email.trim().toLowerCase();
    if (!EMAIL_RE.test(address)) {
      setEmailError(t('onboarding.auth.emailInvalid'));
      return;
    }
    setEmailError(null);
    add.mutate({ contactId: null, displayName: name.trim() || address, email: address });
    setName('');
    setEmail('');
    setEmailForm(false);
  }, [email, name, add, t]);

  const goNext = useCallback(() => router.push('/(onboarding)/analysis'), [router]);

  const candidates = useMemo(() => {
    const list = (contactsQuery.data ?? []).filter((contact) => !vipContactIds.has(contact.id));
    return debounced ? list : list.slice(0, SUGGESTED_LIMIT);
  }, [contactsQuery.data, vipContactIds, debounced]);

  return (
    <Screen
      scroll
      keyboardAvoiding
      topGap={6}
      header={
        <ScreenHeader
          variant="sub"
          onBack={() => router.back()}
          backLabel={t('common.back')}
          kicker={t('onboarding.connect.step', { current: 4, total: 4 })}
        />
      }
      footer={
        <View
          style={[
            styles.footer,
            { paddingHorizontal: theme.layout.screenPaddingH, backgroundColor: c.background },
          ]}
        >
          <Button
            label={t('onboarding.vip.skip')}
            variant="tonal"
            size="lg"
            onPress={goNext}
            style={styles.skip}
            testID="vip-skip"
          />
          <Button
            label={
              vips.length > 0
                ? t('onboarding.vip.continueCount', { count: vips.length })
                : t('common.continue')
            }
            size="lg"
            onPress={goNext}
            style={styles.continue}
            testID="vip-continue"
          />
        </View>
      }
      testID="vip-screen"
    >
      <Text variant="display" accessibilityRole="header">
        {t('onboarding.vip.title')}
      </Text>
      <Text variant="body" tone="secondary" style={styles.subtitle}>
        {t('onboarding.vip.subtitle')}
      </Text>
      <SearchBar
        value={query}
        onChangeText={setQuery}
        placeholder={t('onboarding.vip.search')}
        accessibilityLabel={t('common.search')}
        clearLabel={t('common.close')}
        style={styles.search}
        testID="vip-search"
      />
      <View style={styles.actions}>
        <Button
          label={t('onboarding.vip.fromContacts')}
          variant="surface"
          size="sm"
          icon="person"
          onPress={() => void fromAddressBook()}
          testID="vip-contacts"
        />
        <Button
          label={t('onboarding.vip.addManual')}
          variant="surface"
          size="sm"
          icon="mail"
          onPress={() => setEmailForm((v) => !v)}
          testID="vip-add-email"
        />
      </View>
      {emailForm ? (
        <View style={styles.form}>
          <TextField
            value={name}
            onChangeText={setName}
            placeholder={t('onboarding.vip.namePlaceholder')}
            leftIcon="person"
            autoCapitalize="words"
            testID="vip-email-name"
          />
          <TextField
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              if (emailError) setEmailError(null);
            }}
            placeholder={t('onboarding.auth.emailPlaceholder')}
            leftIcon="mail"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            error={emailError}
            returnKeyType="done"
            onSubmitEditing={submitEmail}
            testID="vip-email-input"
          />
          <Button
            label={t('onboarding.vip.add')}
            size="sm"
            loading={add.isPending}
            onPress={submitEmail}
            testID="vip-email-save"
          />
        </View>
      ) : null}

      {vips.length > 0 ? (
        <View style={styles.section}>
          <ListGroupTitle label={t('onboarding.vip.selected', { count: vips.length })} />
          <ListGroup>
            {vips.map((vip) => (
              <ListRow
                key={vip.id}
                title={vip.displayName}
                meta={vip.email ?? vip.relation ?? null}
                leading={<Avatar name={vip.displayName} size={40} vip />}
                trailing={
                  <IconButton
                    icon="close"
                    variant="plain"
                    size={36}
                    iconSize={18}
                    color={c.inkTertiary}
                    accessibilityLabel={t('onboarding.vip.remove')}
                    onPress={() => remove.mutate(vip)}
                    testID={`vip-remove-${vip.id}`}
                  />
                }
              />
            ))}
          </ListGroup>
        </View>
      ) : null}

      <View style={styles.section}>
        <ListGroupTitle
          label={debounced ? t('onboarding.vip.results') : t('onboarding.vip.suggested')}
        />
        {candidates.length > 0 ? (
          <ListGroup>
            {candidates.map((contact, index) => (
              <ListRow
                key={contact.id}
                title={contact.displayName}
                meta={contact.company ?? contact.emails[0] ?? null}
                leading={
                  <Avatar name={contact.displayName} imageUrl={contact.avatarUrl} size={40} />
                }
                trailing={<Icon name="add" size={20} color={c.primary} />}
                onPress={() => addContact(contact)}
                accessibilityHint={t('onboarding.vip.add')}
                testID={`vip-contact-${index}`}
              />
            ))}
          </ListGroup>
        ) : (
          <Text variant="small" tone="tertiary" style={styles.empty}>
            {contactsQuery.isPending ? t('common.loading') : t('onboarding.vip.noResults')}
          </Text>
        )}
        <Text variant="caption" tone="tertiary" style={styles.note}>
          {t('onboarding.vip.contactsPermission')}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: { marginTop: 8 },
  search: { marginTop: 20 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  form: { marginTop: 12, gap: 10 },
  section: { marginTop: 22 },
  empty: { paddingHorizontal: 4, paddingVertical: 8 },
  note: { marginTop: 10, paddingHorizontal: 4 },
  footer: { flexDirection: 'row', gap: 8, paddingTop: 10, paddingBottom: 12 },
  skip: { flex: 1 },
  continue: { flex: 2 },
});
