/**
 * Connected accounts (`ds.accounts.*`) for the Integrations screen: list, "Bağlantıyı Yenile" (reconnect
 * through a browser auth session), progressive "Yazma izni ver" (extra scope group on the same account),
 * "Şimdi eşitle", "Birincil yap" and "Kaldır". The demo adapter returns the app callback as its
 * authorization URL, so no consent screen opens there (same convention as `useOAuthConnect`).
 */
import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { qk } from '@da/api-client';
import type { ConnectedAccount, OAuthStartResponse } from '@da/domain';
import { useToast } from '@da/ui';
import { parseOAuthCallback } from '@/features/onboarding/useOAuthConnect';
import { useDataSource } from '@/hooks/useDataSource';
import { track } from '@/lib/analytics';
import { env } from '@/lib/env';
import { describeError } from '@/lib/errors';
import { captureError } from '@/lib/monitoring';
import { isLiveAccount, nextWriteGroup, oauthKindsOf, oauthProviderOf } from './scopes';

export type IntegrationAction = 'reconnect' | 'grant' | 'sync' | 'primary' | 'remove';

export interface IntegrationBusy {
  id: string;
  action: IntegrationAction;
}

const SYNC_RELATED_KEYS = [
  ['today'],
  ['flow'],
  ['plan'],
  ['events'],
  ['mailIntelligence'],
] as const;

export function redirectUriFor(provider: 'google' | 'microsoft'): string {
  return `${env.appScheme}://oauth/${provider}`;
}

export function useIntegrations() {
  const ds = useDataSource();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation();
  const [busy, setBusy] = useState<IntegrationBusy | null>(null);

  const query = useQuery({ queryKey: qk.accounts, queryFn: () => ds.accounts.listAccounts() });
  const accounts = useMemo(
    () =>
      (query.data ?? [])
        .filter(isLiveAccount)
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)),
    [query.data],
  );

  const invalidateAccounts = useCallback(
    () => queryClient.invalidateQueries({ queryKey: qk.accounts }),
    [queryClient],
  );

  const showError = useCallback(
    (e: unknown) =>
      toast.show({ message: describeError(e, t).title, icon: 'conflict', iconTone: 'critical' }),
    [toast, t],
  );

  /**
   * Opens the provider consent (or short-circuits for the demo callback) and completes the OAuth flow.
   * Returns null when the user cancelled.
   */
  const runAuthSession = useCallback(
    async (
      start: OAuthStartResponse,
      redirectTo: string,
      accountId: string,
    ): Promise<ConnectedAccount | null> => {
      let callbackUrl: string;
      if (start.authorizationUrl.startsWith(`${env.appScheme}://`)) {
        callbackUrl = start.authorizationUrl;
      } else {
        const result = await WebBrowser.openAuthSessionAsync(start.authorizationUrl, redirectTo);
        if (result.type !== 'success') return null;
        callbackUrl = result.url;
      }
      const callback = parseOAuthCallback(callbackUrl);
      try {
        return await ds.accounts.completeOAuth({
          state: callback.state ?? start.state,
          status: callback.status,
          accountId: callback.accountId ?? accountId,
          error: callback.error,
        });
      } catch (e) {
        // The deep-link handler may have completed the same callback first (Android); trust the list.
        const fresh = (await ds.accounts.listAccounts()).find((a) => a.id === accountId);
        if (!fresh) throw e;
        return fresh;
      }
    },
    [ds],
  );

  const reconnect = useMutation({
    mutationFn: async (account: ConnectedAccount): Promise<ConnectedAccount | null> => {
      const provider = oauthProviderOf(account);
      if (!provider) return null;
      const redirectTo = redirectUriFor(provider);
      const start = await ds.accounts.reconnect(account.id, redirectTo);
      return runAuthSession(start, redirectTo, account.id);
    },
    onMutate: (account) => setBusy({ id: account.id, action: 'reconnect' }),
    onSettled: () => setBusy(null),
    onSuccess: async (result) => {
      await invalidateAccounts();
      if (!result) {
        toast.show({ message: t('errors.oauthCancelled'), icon: 'warning', iconTone: 'critical' });
        return;
      }
      toast.show({ message: t('settings.integrationsScreen.reconnected'), icon: 'check' });
    },
    onError: (e, account) => {
      captureError(e, { where: 'useIntegrations.reconnect', accountId: account.id });
      showError(e);
    },
  });

  const grantWrite = useMutation({
    mutationFn: async (account: ConnectedAccount): Promise<ConnectedAccount | null> => {
      const provider = oauthProviderOf(account);
      const scopeGroup = nextWriteGroup(account);
      if (!provider || !scopeGroup) return null;
      const redirectTo = redirectUriFor(provider);
      const start = await ds.accounts.startOAuth({
        provider,
        kinds: oauthKindsOf(account),
        scopeGroup,
        redirectTo,
        accountId: account.id,
      });
      return runAuthSession(start, redirectTo, account.id);
    },
    onMutate: (account) => setBusy({ id: account.id, action: 'grant' }),
    onSettled: () => setBusy(null),
    onSuccess: async (result, account) => {
      await Promise.all([
        invalidateAccounts(),
        queryClient.invalidateQueries({ queryKey: ['approvals'] }),
      ]);
      if (!result) {
        toast.show({ message: t('errors.oauthCancelled'), icon: 'warning', iconTone: 'critical' });
        return;
      }
      const provider = oauthProviderOf(account);
      if (provider)
        track('account_connected', { provider, kind: oauthKindsOf(account)[0] ?? 'email' });
      toast.show({ message: t('settings.integrationsScreen.granted'), icon: 'check' });
    },
    onError: (e, account) => {
      captureError(e, { where: 'useIntegrations.grantWrite', accountId: account.id });
      showError(e);
    },
  });

  const disconnect = useMutation({
    mutationFn: (account: ConnectedAccount) => ds.accounts.disconnect(account.id),
    onMutate: (account) => setBusy({ id: account.id, action: 'remove' }),
    onSettled: () => setBusy(null),
    onSuccess: async () => {
      await Promise.all([
        invalidateAccounts(),
        queryClient.invalidateQueries({ queryKey: qk.entitlement }),
        ...SYNC_RELATED_KEYS.map((key) => queryClient.invalidateQueries({ queryKey: [...key] })),
      ]);
      toast.show({ message: t('settings.integrationsScreen.removed'), icon: 'check' });
    },
    onError: showError,
  });

  const syncNow = useMutation({
    mutationFn: (account: ConnectedAccount) => ds.accounts.syncNow({ accountId: account.id }),
    onMutate: (account) => setBusy({ id: account.id, action: 'sync' }),
    onSettled: () => setBusy(null),
    onSuccess: async () => {
      await Promise.all([
        invalidateAccounts(),
        ...SYNC_RELATED_KEYS.map((key) => queryClient.invalidateQueries({ queryKey: [...key] })),
      ]);
      toast.show({ message: t('settings.integrationsScreen.synced'), icon: 'sync' });
    },
    onError: showError,
  });

  const setPrimary = useMutation({
    mutationFn: (account: ConnectedAccount) => ds.accounts.setPrimary(account.id),
    onMutate: async (account) => {
      setBusy({ id: account.id, action: 'primary' });
      await queryClient.cancelQueries({ queryKey: qk.accounts });
      const previous = queryClient.getQueryData<ConnectedAccount[]>(qk.accounts);
      queryClient.setQueryData<ConnectedAccount[]>(qk.accounts, (old) =>
        (old ?? []).map((a) => ({ ...a, isPrimary: a.id === account.id })),
      );
      return { previous };
    },
    onError: (e, _account, context) => {
      if (context?.previous) queryClient.setQueryData(qk.accounts, context.previous);
      showError(e);
    },
    onSuccess: (_result, account) => {
      toast.show({
        message: t('settings.integrationsScreen.madePrimary', {
          name: account.email ?? account.displayName,
        }),
        icon: 'check',
      });
    },
    onSettled: async () => {
      setBusy(null);
      await invalidateAccounts();
    },
  });

  return {
    query,
    accounts,
    busy,
    reconnect,
    grantWrite,
    disconnect,
    syncNow,
    setPrimary,
    refetch: query.refetch,
  };
}
