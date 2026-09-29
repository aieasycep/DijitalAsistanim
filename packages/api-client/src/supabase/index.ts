/**
 * SupabaseDataSource — the production DataSource: RLS-scoped tables through PostgREST, Edge Functions through
 * the EDGE_FUNCTIONS catalogue, Supabase Auth with session material in secure storage, private Storage buckets
 * and Realtime for the pending-approvals badge.
 */
import type { DataSource } from '../datasource';
import { createAccountsApi, createOnboardingApi } from './accounts';
import { createApprovalsApi, createRemindersApi } from './approvals';
import { createAssistantApi, createSearchApi } from './assistant';
import { createAuthApi } from './auth';
import {
  createAndroidNotificationsApi,
  createBillingApi,
  createBriefingsApi,
  createPrivacyApi,
} from './briefings';
import { createCaptureApi } from './capture';
import { createSupabaseContext, type SupabaseDataSourceConfig } from './client';
import { createEmailApi } from './email';
import { createFeedApi } from './feed';
import { clearLocalState } from './localState';
import { createPeopleApi, createRulesApi } from './people';
import { createMeetingApi, createPlanApi } from './plan';
import { createProfileApi } from './profile';

export type { SupabaseDataSourceConfig } from './client';
export { createChunkedSecureStorage, SECURE_STORE_MAX_BYTES } from './secureStorage';
export { createFunctionsClient, AI_TIMEOUT_MS, DEFAULT_TIMEOUT_MS } from './functions';

export function createSupabaseDataSource(config: SupabaseDataSourceConfig): DataSource {
  const ctx = createSupabaseContext(config);
  return {
    mode: 'supabase',
    auth: createAuthApi(ctx),
    profile: createProfileApi(ctx),
    accounts: createAccountsApi(ctx),
    onboarding: createOnboardingApi(ctx),
    feed: createFeedApi(ctx),
    email: createEmailApi(ctx),
    plan: createPlanApi(ctx),
    meetings: createMeetingApi(ctx),
    approvals: createApprovalsApi(ctx),
    reminders: createRemindersApi(ctx),
    assistant: createAssistantApi(ctx),
    search: createSearchApi(ctx),
    capture: createCaptureApi(ctx),
    people: createPeopleApi(ctx),
    rules: createRulesApi(ctx),
    briefings: createBriefingsApi(ctx),
    billing: createBillingApi(ctx),
    privacy: createPrivacyApi(ctx),
    androidNotifications: createAndroidNotificationsApi(ctx),
    clearLocalState: () => clearLocalState(ctx),
  };
}
