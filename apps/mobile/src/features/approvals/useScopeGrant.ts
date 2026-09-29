/**
 * Progressive OAuth for an approval: `ds.accounts.startOAuth` with the write scope group (or
 * `reconnect` when the grant expired) → provider consent in an auth session → app callback →
 * `ds.accounts.completeOAuth`. The demo adapter returns the callback as its "authorization URL", so the
 * consent step is skipped there. The caller retries / re-approves once this resolves `granted`.
 */
import { useCallback, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { useQueryClient } from '@tanstack/react-query';
import { qk } from '@da/api-client';
import type { ApprovalAction, ConnectedAccount, OAuthStartRequest } from '@da/domain';
import { useDataSource } from '@/hooks/useDataSource';
import { env } from '@/lib/env';
import { captureError } from '@/lib/monitoring';
import { parseOAuthCallback } from '../onboarding/useOAuthConnect';
import { accountIdOf, SCOPE_GROUP } from './approvalMeta';
import type { ScopeGrantMode } from './ScopeSheet';

export type ScopeGrantOutcome = 'granted' | 'cancelled' | 'no_account';

type OAuthProvider = 'google' | 'microsoft';
type OAuthKind = OAuthStartRequest['kinds'][number];

function isOAuthProvider(p: ConnectedAccount['provider']): p is OAuthProvider {
  return p === 'google' || p === 'microsoft';
}

function oauthKinds(account: ConnectedAccount): OAuthKind[] {
  const kinds = account.kinds.filter(
    (k): k is OAuthKind => k === 'email' || k === 'calendar' || k === 'tasks',
  );
  return kinds.length > 0 ? kinds : ['email'];
}

/** The account an approval writes through (payload.accountId), or the primary OAuth account as a fallback. */
export function resolveApprovalAccount(
  approval: Pick<ApprovalAction, 'payload'>,
  accounts: ConnectedAccount[],
): ConnectedAccount | null {
  const id = accountIdOf(approval.payload as unknown as Record<string, unknown>);
  const live = accounts.filter((a) => !a.deletedAt);
  const byId = id ? live.find((a) => a.id === id) : undefined;
  if (byId) return byId;
  return live.find((a) => a.isPrimary && isOAuthProvider(a.provider)) ?? null;
}

export function useScopeGrant() {
  const ds = useDataSource();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const grant = useCallback(
    async (approval: ApprovalAction, mode: ScopeGrantMode): Promise<ScopeGrantOutcome> => {
      setBusy(true);
      try {
        const accounts = await queryClient.ensureQueryData({
          queryKey: qk.accounts,
          queryFn: () => ds.accounts.listAccounts(),
          staleTime: 60_000,
        });
        const account = resolveApprovalAccount(approval, accounts);
        if (!account || !isOAuthProvider(account.provider)) return 'no_account';
        const redirectTo = `${env.appScheme}://oauth/${account.provider}`;
        const start =
          mode === 'reconnect'
            ? await ds.accounts.reconnect(account.id, redirectTo)
            : await ds.accounts.startOAuth({
                provider: account.provider,
                kinds: oauthKinds(account),
                scopeGroup: SCOPE_GROUP[approval.type] ?? 'read',
                redirectTo,
                accountId: account.id,
              });
        let callbackUrl: string;
        if (start.authorizationUrl.startsWith(`${env.appScheme}://`)) {
          callbackUrl = start.authorizationUrl;
        } else {
          const result = await WebBrowser.openAuthSessionAsync(start.authorizationUrl, redirectTo);
          if (result.type !== 'success') return 'cancelled';
          callbackUrl = result.url;
        }
        const callback = parseOAuthCallback(callbackUrl);
        try {
          const completed = await ds.accounts.completeOAuth({
            state: callback.state ?? start.state,
            status: callback.status,
            accountId: callback.accountId,
            error: callback.error,
          });
          if (!completed) return 'cancelled';
        } catch (e) {
          // The deep-link handler may have completed the same callback first (Android): verify instead.
          const fresh = (await ds.accounts.listAccounts()).find(
            (a) => a.id === account.id && !a.deletedAt && a.status === 'active',
          );
          if (!fresh) throw e;
        }
        await queryClient.invalidateQueries({ queryKey: qk.accounts });
        return 'granted';
      } catch (e) {
        captureError(e, { where: 'useScopeGrant', mode, type: approval.type });
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [ds, queryClient],
  );

  return { grant, busy };
}
