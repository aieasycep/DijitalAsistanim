/**
 * Demo adapter: a deterministic, stateful, in-memory implementation of the DataSource contract.
 * Fixtures mirror supabase/seed/seed.sql; times derive from `config.now` in `config.timezone`.
 */
import type { DataSourceConfig } from '../config';
import type { DataSource } from '../datasource';
import { createAccountsApi } from './apis/accounts';
import { createAndroidNotificationsApi } from './apis/androidNotifications';
import { createApprovalsApi } from './apis/approvals';
import { createAssistantApi } from './apis/assistant';
import { createAuthApi } from './apis/auth';
import { createBillingApi } from './apis/billing';
import { createBriefingsApi } from './apis/briefings';
import { createCaptureApi } from './apis/capture';
import { createEmailApi } from './apis/email';
import { createFeedApi } from './apis/feed';
import { createMeetingApi } from './apis/meetings';
import { createOnboardingApi } from './apis/onboarding';
import { createPeopleApi } from './apis/people';
import { createPlanApi } from './apis/plan';
import { createPrivacyApi } from './apis/privacy';
import { createProfileApi } from './apis/profile';
import { createRemindersApi } from './apis/reminders';
import { createRulesApi } from './apis/rules';
import { createSearchApi } from './apis/search';
import { createClock } from './clock';
import { Emitter, type DemoContext } from './context';
import { buildEmptyState, buildSeedState, type FixtureContext } from './fixtures';
import { USER_ID } from './ids';
import { createLatency, DEFAULT_TIMINGS, scaleTimings } from './latency';
import { createStore } from './state';

export interface DemoDataSourceOptions {
  /** 1 = realistic latency and background transitions; 0 = instant (tests). */
  timeScale?: number;
  /** Seed of the latency jitter PRNG and demo tokens. */
  seed?: number;
}

const DEFAULT_USER_NAME = 'Yunus';
const DEFAULT_EMAIL = 'yunus@example.com';

export function createDemoDataSource(
  config: DataSourceConfig,
  options: DemoDataSourceOptions = {},
): DataSource {
  const clock = createClock({ now: config.now, timezone: config.timezone });
  const timings = scaleTimings(DEFAULT_TIMINGS, options.timeScale ?? 1);
  const latency = createLatency(options.seed ?? 20260905, timings);
  const userName = config.demoUserName?.trim() || DEFAULT_USER_NAME;

  const fixtureContext = (): FixtureContext => ({
    userId: USER_ID,
    userName,
    displayName: userName === DEFAULT_USER_NAME ? 'Yunus Emre' : userName,
    email: DEFAULT_EMAIL,
    timeZone: clock.timeZone,
    today: clock.today(),
    nowIso: clock.nowIso(),
    lt: clock.lt,
    day: (offset) => clock.addDays(clock.today(), offset),
    minus: (minutes) => clock.addMinutes(clock.now(), -minutes),
    plusDays: (days) => clock.addMinutes(clock.now(), days * 24 * 60),
  });

  const store = createStore({
    storage: config.storage,
    seed: () => buildSeedState(fixtureContext()),
    today: clock.today(),
    persistDebounceMs: timings.persistDebounceMs,
  });

  const ctx: DemoContext = {
    config,
    clock,
    store,
    timings,
    latency,
    userId: USER_ID,
    userName,
    webUrl: config.webUrl.replace(/\/$/, ''),
    pendingChanged: new Emitter<number>(),
    authChanged: new Emitter(),
    run: async (fn) => {
      await store.ready;
      await latency.wait();
      return fn();
    },
    nowIso: () => clock.nowIso(),
    nextId: () => store.nextId(),
    seed: () => buildSeedState(fixtureContext()),
    emptySeed: () => buildEmptyState(fixtureContext()),
  };

  const auth = createAuthApi(ctx);

  return {
    mode: 'demo',
    auth,
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
    privacy: createPrivacyApi(ctx, auth),
    androidNotifications: createAndroidNotificationsApi(ctx),
    clearLocalState: async () => {
      await store.ready;
      await store.reset();
      await auth.clearSession();
      ctx.pendingChanged.emit(store.state.approvals.filter((a) => a.status === 'pending').length);
    },
  };
}
