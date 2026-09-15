/**
 * Connects a Google / Microsoft mail or calendar account:
 * `ds.accounts.startOAuth` → provider consent in an auth session → `dijitalasistan://oauth/<provider>` callback
 * → `ds.accounts.completeOAuth`. The demo adapter returns the callback URL as its "authorization URL", so the
 * consent step is skipped and the account is completed immediately. The deep-link handler (app/oauth/[provider])
 * may complete the same callback first on Android; in that case the fresh account list is used instead of failing.
 */
import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { qk } from '@da/api-client';
import type { ConnectedAccount } from '@da/domain';
import { useToast } from '@da/ui';
import { useDataSource } from '@/hooks/useDataSource';
import { track } from '@/lib/analytics';
import { env } from '@/lib/env';
import { describeError } from '@/lib/errors';
import { captureError } from '@/lib/monitoring';

export type OAuthTarget = 'gmail' | 'outlook' | 'google_calendar' | 'microsoft_calendar';

export interface OAuthTargetSpec {
  provider: 'google' | 'microsoft';
  kind: 'email' | 'calendar';
}

export const OAUTH_TARGETS: Record<OAuthTarget, OAuthTargetSpec> = {
  gmail: { provider: 'google', kind: 'email' },
  outlook: { provider: 'microsoft', kind: 'email' },
  google_calendar: { provider: 'google', kind: 'calendar' },
  microsoft_calendar: { provider: 'microsoft', kind: 'calendar' },
};

export interface OAuthCallbackParams {
  state: string | null;
  status: 'ok' | 'error';
  accountId?: string;
  error?: string;
}

/** Parses `scheme://oauth/<provider>?state=&status=&accountId=&error=` (React Native has no URLSearchParams.get). */
export function parseOAuthCallback(url: string): OAuthCallbackParams {
  const query = url.split('#')[0]?.split('?')[1] ?? '';
  const params: Record<string, string> = {};
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const [rawKey, ...rest] = pair.split('=');
    const key = rawKey ?? '';
    if (!key) continue;
    try {
      params[decodeURIComponent(key)] = decodeURIComponent(rest.join('=').replace(/\+/g, ' '));
    } catch {
      params[key] = rest.join('=');
    }
  }
  return {
    state: params.state ?? null,
    status: params.status === 'error' ? 'error' : 'ok',
    accountId: params.accountId || undefined,
    error: params.error || undefined,
  };
}

export function isAccountActive(account: ConnectedAccount): boolean {
  return !account.deletedAt && (account.status === 'active' || account.status === 'syncing');
}

export function matchesTarget(account: ConnectedAccount, target: OAuthTarget): boolean {
  const spec = OAUTH_TARGETS[target];
  return (
    isAccountActive(account) &&
    account.provider === spec.provider &&
    account.kinds.includes(spec.kind)
  );
}

export function useOAuthConnect() {
  const ds = useDataSource();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation();
  const [connecting, setConnecting] = useState<OAuthTarget | null>(null);

  const connect = useCallback(
    async (target: OAuthTarget): Promise<ConnectedAccount | null> => {
      if (connecting) return null;
      const spec = OAUTH_TARGETS[target];
      const redirectTo = `${env.appScheme}://oauth/${spec.provider}`;
      setConnecting(target);
      try {
        const start = await ds.accounts.startOAuth({
          provider: spec.provider,
          kinds: [spec.kind],
          redirectTo,
        });
        let callbackUrl: string;
        if (start.authorizationUrl.startsWith(`${env.appScheme}://`)) {
          // Demo adapter: no consent screen — the "authorization URL" already is the app callback.
          callbackUrl = start.authorizationUrl;
        } else {
          const result = await WebBrowser.openAuthSessionAsync(start.authorizationUrl, redirectTo);
          if (result.type !== 'success') return null;
          callbackUrl = result.url;
        }
        const callback = parseOAuthCallback(callbackUrl);
        let account: ConnectedAccount | null = null;
        try {
          account = await ds.accounts.completeOAuth({
            state: callback.state ?? start.state,
            status: callback.status,
            accountId: callback.accountId,
            error: callback.error,
          });
        } catch (e) {
          const fresh = (await ds.accounts.listAccounts()).find((a) => matchesTarget(a, target));
          if (!fresh) throw e;
          account = fresh;
        }
        await queryClient.invalidateQueries({ queryKey: qk.accounts });
        if (!account) {
          toast.show({
            message: t('errors.oauthCancelled'),
            icon: 'warning',
            iconTone: 'critical',
          });
          return null;
        }
        track('account_connected', { provider: spec.provider, kind: spec.kind });
        return account;
      } catch (e) {
        captureError(e, { where: 'useOAuthConnect', target });
        toast.show({ message: describeError(e, t).title, icon: 'warning', iconTone: 'critical' });
        return null;
      } finally {
        setConnecting(null);
      }
    },
    [connecting, ds, queryClient, toast, t],
  );

  return { connect, connecting };
}
