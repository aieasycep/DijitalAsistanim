/**
 * Server-side plan resolution (service role has no auth.uid(), so `my_entitlement` cannot be used here).
 * Precedence: RevenueCat/promo/demo subscription that grants Pro → active referral credit → free.
 */
import type { Plan } from '@da/domain';
import type { Db } from './db.ts';

export interface ResolvedPlan {
  plan: Plan;
  source: 'revenuecat' | 'promo' | 'demo' | 'referral' | 'none';
  expiresAt: string | null;
  timezone: string;
  locale: 'tr' | 'en';
  firstName: string;
  displayName: string;
}

export async function resolvePlan(admin: Db, userId: string): Promise<ResolvedPlan> {
  const now = new Date().toISOString();
  const [{ data: profile }, { data: subs }, { data: credit }] = await Promise.all([
    admin.from('profiles').select('timezone, locale, first_name, display_name').eq('id', userId).maybeSingle(),
    admin
      .from('subscriptions')
      .select('source, status, expires_at')
      .eq('user_id', userId)
      .in('source', ['revenuecat', 'promo', 'demo'])
      .in('status', ['trial', 'active', 'grace']),
    admin.from('referral_credits').select('expires_at').eq('user_id', userId).gt('expires_at', now).order('expires_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const p = profile as { timezone: string; locale: 'tr' | 'en'; first_name: string; display_name: string } | null;
  const base = { timezone: p?.timezone ?? 'Europe/Istanbul', locale: p?.locale ?? 'tr', firstName: p?.first_name ?? '', displayName: p?.display_name ?? '' } as const;
  const live = ((subs ?? []) as { source: 'revenuecat' | 'promo' | 'demo'; status: string; expires_at: string | null }[])
    .filter((s) => !s.expires_at || Date.parse(s.expires_at) > Date.now())
    .sort((a, b) => order(a.source) - order(b.source));
  const first = live[0];
  if (first) return { plan: 'pro', source: first.source, expiresAt: first.expires_at, ...base };
  const c = credit as { expires_at: string } | null;
  if (c) return { plan: 'pro', source: 'referral', expiresAt: c.expires_at, ...base };
  return { plan: 'free', source: 'none', expiresAt: null, ...base };
}

function order(source: 'revenuecat' | 'promo' | 'demo'): number {
  return source === 'revenuecat' ? 0 : source === 'promo' ? 1 : 2;
}
