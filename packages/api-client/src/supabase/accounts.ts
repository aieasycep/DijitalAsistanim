/** AccountsApi + OnboardingApi: connected_accounts (client-writable subset) and the OAuth / sync functions. */
import type {
  AccountKind,
  ConnectedAccount,
  DataSourceControls,
  EdgeFunctionRequest,
  OAuthStartRequest,
} from '@da/domain';
import type { AccountsApi, DeviceApprovalResult, OnboardingApi } from '../datasource';
import { ClientApiError } from '../errors';
import { exec, read, write, type SupabaseContext } from './client';
import { deviceAccountToRow, toConnectedAccount } from './mappers';
import type { ConnectedAccountRow } from './rows';

type OAuthKind = OAuthStartRequest['kinds'][number];

function isOAuthKind(kind: AccountKind): kind is OAuthKind {
  return kind === 'email' || kind === 'calendar' || kind === 'tasks';
}

export function createAccountsApi(ctx: SupabaseContext): AccountsApi {
  const accounts = () => ctx.table<ConnectedAccountRow>('connected_accounts');

  async function loadAccount(userId: string, accountId: string): Promise<ConnectedAccount> {
    return toConnectedAccount(
      await exec(accounts().select('*').eq('user_id', userId).eq('id', accountId).single()),
    );
  }

  return {
    listAccounts: () =>
      read(async () => {
        const userId = await ctx.requireUserId();
        const rows = await exec(
          accounts()
            .select('*')
            .eq('user_id', userId)
            .is('deleted_at', null)
            .order('created_at', { ascending: true }),
        );
        return rows.map(toConnectedAccount);
      }),

    startOAuth: (req) => ctx.call('oauth-start', req),

    /**
     * The provider callback lands on the Edge Function which redirects to the app deep link with
     * `state`, `status` and (on success) `accountId`. `access_denied` means the user cancelled → null.
     */
    completeOAuth: (input) =>
      write(async () => {
        if (input.status === 'error') {
          if (input.error === 'access_denied') return null;
          throw new ClientApiError({
            code: 'provider_unavailable',
            message: input.error ?? 'Hesap bağlanamadı.',
            details: { state: input.state, providerError: input.error ?? null },
          });
        }
        const userId = await ctx.requireUserId();
        if (input.accountId) {
          const row = await exec(
            accounts().select('*').eq('user_id', userId).eq('id', input.accountId).maybeSingle(),
          );
          return row ? toConnectedAccount(row) : null;
        }
        const rows = await exec(
          accounts()
            .select('*')
            .eq('user_id', userId)
            .is('deleted_at', null)
            .order('updated_at', { ascending: false })
            .limit(1),
        );
        const latest = rows[0];
        return latest ? toConnectedAccount(latest) : null;
      }),

    registerDeviceCalendar: (input) =>
      write(async () => {
        const userId = await ctx.requireUserId();
        const row = await exec(
          accounts()
            .upsert(deviceAccountToRow(userId, input), {
              onConflict: 'user_id,provider,external_account_id',
            })
            .select('*')
            .single(),
        );
        return toConnectedAccount(row);
      }),

    updateControls: (accountId, controls) =>
      write(async () => {
        const userId = await ctx.requireUserId();
        const current = await loadAccount(userId, accountId);
        const merged: DataSourceControls = { ...current.controls };
        for (const key of Object.keys(controls) as (keyof DataSourceControls)[]) {
          const value = controls[key];
          if (value !== undefined) merged[key] = value;
        }
        const row = await exec(
          accounts()
            .update({ controls: merged })
            .eq('user_id', userId)
            .eq('id', accountId)
            .select('*')
            .single(),
        );
        return toConnectedAccount(row);
      }),

    setPrimary: (accountId) =>
      write(async () => {
        const userId = await ctx.requireUserId();
        await exec(
          accounts()
            .update({ is_primary: false })
            .eq('user_id', userId)
            .eq('is_primary', true)
            .neq('id', accountId),
        );
        await exec(
          accounts().update({ is_primary: true }).eq('user_id', userId).eq('id', accountId),
        );
      }),

    disconnect: async (accountId) => {
      await ctx.call('accounts-disconnect', { accountId });
    },

    reconnect: (accountId, redirectTo) =>
      write(async () => {
        const userId = await ctx.requireUserId();
        const account = await loadAccount(userId, accountId);
        if (account.provider !== 'google' && account.provider !== 'microsoft') {
          throw new ClientApiError({
            code: 'validation',
            message: 'Cihaz takvimleri yeniden bağlanmaz; cihaz ayarlarından erişimi kontrol et.',
          });
        }
        const kinds = account.kinds.filter(isOAuthKind);
        return ctx.call('oauth-start', {
          provider: account.provider,
          kinds: kinds.length > 0 ? kinds : ['email'],
          scopeGroup: 'read',
          redirectTo,
          accountId,
        });
      }),

    syncNow: async (input) => {
      await ctx.call('accounts-sync-now', {
        accountId: input?.accountId,
        resource: input?.resource,
      });
    },

    /**
     * `approvalResult` finalises a device-executed approval (the function accepts an empty event list in
     * that case); a plain sync with nothing to upload is a no-op.
     */
    upsertDeviceEvents: async (accountId, events, approvalResult) => {
      if (events.length === 0 && !approvalResult) return;
      const body: EdgeFunctionRequest<'device-calendar-upsert'> & {
        approvalResult?: DeviceApprovalResult;
      } = { accountId, events, ...(approvalResult ? { approvalResult } : {}) };
      await ctx.call('device-calendar-upsert', body);
    },
  };
}

export function createOnboardingApi(ctx: SupabaseContext): OnboardingApi {
  return {
    startInitialAnalysis: (input) =>
      ctx.call('initial-analysis-start', { windowHours: input?.windowHours }),
    getInitialAnalysisStatus: () => ctx.call('initial-analysis-status', {}),
  };
}
