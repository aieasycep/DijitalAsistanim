/**
 * VIP people (`ds.people.listVips/addVip/removeVip`): list, add from the device address book or by e-mail,
 * "her zaman bildir" toggle (optimistic, persisted through `addVip` on the same contact) and removal.
 * The address book is never uploaded — only the contact the user picks reaches the backend.
 */
import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { qk } from '@da/api-client';
import type { VipPerson } from '@da/domain';
import { useToast } from '@da/ui';
import { useDataSource } from '@/hooks/useDataSource';
import { describeError } from '@/lib/errors';
import { pickDeviceContact, primaryEmail, requestContactsPermission } from '@/services/contacts';
import { openAppSettings } from '@/services/handoff';

export interface AddVipInput {
  contactId?: string | null;
  displayName: string;
  email?: string | null;
  relation?: string | null;
  notifyAlways?: boolean;
}

export type VipBusyAction = 'add' | 'remove' | 'notify';

const RELATED_KEYS = [['contacts'], ['today'], ['flow'], ['person']] as const;

const collator = new Intl.Collator('tr-TR', { sensitivity: 'base' });

export function useVips() {
  const ds = useDataSource();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation();
  const [busy, setBusy] = useState<{ id: string; action: VipBusyAction } | null>(null);

  const query = useQuery({ queryKey: qk.vips, queryFn: () => ds.people.listVips() });
  const vips = useMemo(
    () => [...(query.data ?? [])].sort((a, b) => collator.compare(a.displayName, b.displayName)),
    [query.data],
  );

  const invalidate = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.vips }),
      ...RELATED_KEYS.map((key) => queryClient.invalidateQueries({ queryKey: [...key] })),
    ]);
  }, [queryClient]);

  const onError = useCallback(
    (e: unknown) =>
      toast.show({ message: describeError(e, t).title, icon: 'conflict', iconTone: 'critical' }),
    [toast, t],
  );

  const add = useMutation({
    mutationFn: (input: AddVipInput) =>
      ds.people.addVip({
        contactId: input.contactId ?? null,
        displayName: input.displayName,
        email: input.email ?? null,
        relation: input.relation ?? null,
        notifyAlways: input.notifyAlways ?? true,
      }),
    onSuccess: async (vip) => {
      await invalidate();
      toast.show({
        message: t('settings.vipScreen.added', { name: vip.displayName }),
        icon: 'vip',
        iconTone: 'primary',
      });
    },
    onError,
  });

  const remove = useMutation({
    mutationFn: (vip: VipPerson) => ds.people.removeVip(vip.id),
    onMutate: (vip) => setBusy({ id: vip.id, action: 'remove' }),
    onSettled: () => setBusy(null),
    onSuccess: async (_result, vip) => {
      await invalidate();
      toast.show({
        message: t('settings.vipScreen.removed', { name: vip.displayName }),
        icon: 'check',
      });
    },
    onError,
  });

  const setNotify = useMutation({
    mutationFn: (input: { vip: VipPerson; notifyAlways: boolean }) =>
      ds.people.addVip({
        contactId: input.vip.contactId ?? null,
        displayName: input.vip.displayName,
        email: input.vip.email ?? null,
        relation: input.vip.relation ?? null,
        notifyAlways: input.notifyAlways,
      }),
    onMutate: async ({ vip, notifyAlways }) => {
      setBusy({ id: vip.id, action: 'notify' });
      await queryClient.cancelQueries({ queryKey: qk.vips });
      const previous = queryClient.getQueryData<VipPerson[]>(qk.vips);
      queryClient.setQueryData<VipPerson[]>(qk.vips, (old) =>
        (old ?? []).map((v) => (v.id === vip.id ? { ...v, notifyAlways } : v)),
      );
      return { previous };
    },
    onError: (e, _input, context) => {
      if (context?.previous) queryClient.setQueryData(qk.vips, context.previous);
      onError(e);
    },
    onSettled: async () => {
      setBusy(null);
      await queryClient.invalidateQueries({ queryKey: qk.vips });
    },
  });

  const { mutate: addMutate } = add;

  /** Contacts permission (explained by the caller) → system picker → addVip with the picked identity. */
  const addFromContacts = useCallback(async (): Promise<boolean> => {
    const permission = await requestContactsPermission();
    if (permission !== 'granted') {
      toast.show({
        message: t('settings.vipScreen.contactsDenied'),
        icon: 'warning',
        iconTone: 'critical',
        actionLabel: t('settings.vipScreen.openSettings'),
        onAction: () => void openAppSettings(),
      });
      return false;
    }
    const picked = await pickDeviceContact();
    if (!picked || !picked.displayName) return false;
    const email = primaryEmail(picked);
    if (!email) toast.show({ message: t('settings.vipScreen.noEmailInContact'), icon: 'info' });
    addMutate({
      contactId: null,
      displayName: picked.displayName,
      email,
      relation: picked.company,
      notifyAlways: true,
    });
    return true;
  }, [addMutate, toast, t]);

  return { query, vips, busy, add, remove, setNotify, addFromContacts };
}
