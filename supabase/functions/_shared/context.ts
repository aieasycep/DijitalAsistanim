/**
 * Per-user read context shared by feed / briefing / plan / assistant functions:
 * profile + preferences + connected accounts (provider per account → SourceRef type) + user e-mails.
 */
import type { ConnectedAccount, Insight, Locale, SourceType, UserPreferences } from '@da/domain';
import { AppError } from '@da/server-core/errors';
import type { Db } from './db.ts';
import { camelize } from './rows.ts';

export interface UserContext {
  userId: string;
  locale: Locale;
  timezone: string;
  firstName: string;
  displayName: string;
  email: string | null;
  onboardingCompletedAt: string | null;
  firstAnalysisCompletedAt: string | null;
  preferences: UserPreferences | null;
  accounts: ConnectedAccount[];
  userEmails: string[];
  /** account id → source type for e-mail threads (gmail / outlook). */
  accountSourceTypes: Record<string, SourceType>;
  /** account id → calendar source type. */
  calendarSourceTypes: Record<string, SourceType>;
}

export async function loadUserContext(db: Db, userId: string): Promise<UserContext> {
  const [{ data: profile, error }, { data: prefs }, { data: accounts }] = await Promise.all([
    db
      .from('profiles')
      .select(
        'id, first_name, display_name, email, timezone, locale, onboarding_completed_at, first_analysis_completed_at',
      )
      .eq('id', userId)
      .maybeSingle(),
    db.from('user_preferences').select('*').eq('user_id', userId).maybeSingle(),
    db.from('connected_accounts').select('*').eq('user_id', userId).is('deleted_at', null),
  ]);
  if (error || !profile) throw new AppError('not_found', 'Profil bulunamadı.');
  const p = profile as {
    first_name: string;
    display_name: string;
    email: string | null;
    timezone: string;
    locale: Locale;
    onboarding_completed_at: string | null;
    first_analysis_completed_at: string | null;
  };
  const preferences = prefs ? camelize<UserPreferences>(prefs) : null;
  const list = camelize<ConnectedAccount[]>(accounts ?? []);
  const accountSourceTypes: Record<string, SourceType> = {};
  const calendarSourceTypes: Record<string, SourceType> = {};
  for (const a of list) {
    accountSourceTypes[a.id] = a.provider === 'microsoft' ? 'outlook' : 'gmail';
    calendarSourceTypes[a.id] =
      a.provider === 'microsoft'
        ? 'microsoft_calendar'
        : a.provider === 'apple'
          ? 'apple_calendar'
          : a.provider === 'device'
            ? 'device_calendar'
            : 'google_calendar';
  }
  const userEmails = [p.email, ...list.map((a) => a.email ?? null)]
    .filter((e): e is string => Boolean(e))
    .map((e) => e.toLowerCase());
  return {
    userId,
    locale: preferences?.locale ?? p.locale ?? 'tr',
    timezone: preferences?.timezone ?? p.timezone ?? 'Europe/Istanbul',
    firstName: p.first_name || p.display_name.split(' ')[0] || '',
    displayName: p.display_name,
    email: p.email,
    onboardingCompletedAt: p.onboarding_completed_at,
    firstAnalysisCompletedAt: p.first_analysis_completed_at,
    preferences,
    accounts: list,
    userEmails: [...new Set(userEmails)],
    accountSourceTypes,
    calendarSourceTypes,
  };
}

/** Active (or snoozed-and-due) insights for the user, newest bucket first. */
export async function loadLiveInsights(
  db: Db,
  userId: string,
  opts: { limit?: number; sinceDate?: string } = {},
): Promise<Insight[]> {
  let q = db
    .from('insights')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .in('status', ['active', 'snoozed']);
  if (opts.sinceDate) q = q.gte('for_date', opts.sinceDate);
  const { data, error } = await q
    .order('priority_score', { ascending: false })
    .limit(opts.limit ?? 300);
  if (error) throw new AppError('internal', `İçgörüler okunamadı: ${error.message}`);
  return camelize<Insight[]>(data ?? []);
}

export async function pendingApprovalCount(db: Db, userId: string): Promise<number> {
  const { count } = await db
    .from('approval_actions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'pending');
  return count ?? 0;
}
