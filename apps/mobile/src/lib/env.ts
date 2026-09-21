import Constants from 'expo-constants';

/**
 * Public runtime configuration (EXPO_PUBLIC_* only — never secrets).
 *
 * Every variable is read as a static `process.env.EXPO_PUBLIC_X` member expression on purpose: Expo inlines
 * exactly those at bundle time. A dynamic bracket-style read through a variable name is never inlined and is
 * always empty on the device, which silently turns a Supabase build into a demo build
 * (scripts/check-dead-code.mjs guards against it).
 * Demo mode is only honoured in non-production builds (see @da/api-client resolveMode).
 */
const extra = (Constants.expoConfig?.extra ?? {}) as {
  isProduction?: boolean;
  appGroup?: string;
  universalHosts?: string[];
};

const clean = (value: string | undefined): string | undefined =>
  value && value.length > 0 ? value : undefined;

/**
 * A production build is the store build: APP_ENV=production / the EAS `production` profile, embedded by
 * app.config.ts as `extra.isProduction`. Release-configured internal builds (EAS `preview` / `demo`, the
 * Android APK workflow) bundle with NODE_ENV=production as well, so NODE_ENV is only the fallback when the
 * embedded config is unavailable.
 */
export const IS_PRODUCTION =
  typeof extra.isProduction === 'boolean'
    ? extra.isProduction
    : process.env.NODE_ENV === 'production';

export const env = {
  dataMode:
    (clean(process.env.EXPO_PUBLIC_DATA_MODE) as 'demo' | 'supabase' | undefined) ??
    (IS_PRODUCTION ? 'supabase' : 'demo'),
  supabaseUrl: clean(process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: clean(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
  webUrl: clean(process.env.EXPO_PUBLIC_WEB_URL) ?? 'https://dijitalasistan.app',
  appScheme: clean(process.env.EXPO_PUBLIC_APP_SCHEME) ?? 'dijitalasistan',
  demoUserName: clean(process.env.EXPO_PUBLIC_DEMO_USER_NAME) ?? 'Yunus',
  revenueCatIosKey: clean(process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY),
  revenueCatAndroidKey: clean(process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY),
  rcEntitlementId: clean(process.env.EXPO_PUBLIC_RC_ENTITLEMENT_ID) ?? 'pro',
  rcProductMonthly: clean(process.env.EXPO_PUBLIC_RC_PRODUCT_MONTHLY) ?? 'da_pro_monthly',
  rcProductAnnual: clean(process.env.EXPO_PUBLIC_RC_PRODUCT_ANNUAL) ?? 'da_pro_annual',
  sentryDsn: clean(process.env.EXPO_PUBLIC_SENTRY_DSN),
  posthogKey: clean(process.env.EXPO_PUBLIC_POSTHOG_KEY),
  posthogHost: clean(process.env.EXPO_PUBLIC_POSTHOG_HOST) ?? 'https://eu.i.posthog.com',
  easProjectId: clean(process.env.EXPO_PUBLIC_EAS_PROJECT_ID),
  googleIosClientId: clean(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID),
  googleAndroidClientId: clean(process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID),
  googleWebClientId: clean(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID),
  appGroup: extra.appGroup ?? 'group.com.dijitalasistan.app',
  universalHosts: extra.universalHosts ?? ['dijitalasistan.app'],
  appVersion: Constants.expoConfig?.version ?? '1.0.0',
  isProduction: IS_PRODUCTION,
  /**
   * E2E / demo builds only: pin the demo clock (ISO instant the app "boots" at, time keeps moving from
   * there) and the demo timezone so greetings, plan suggestions and seeded meetings are deterministic.
   * Ignored outside demo mode.
   */
  demoNow: clean(process.env.EXPO_PUBLIC_DEMO_NOW),
  demoTimezone: clean(process.env.EXPO_PUBLIC_DEMO_TIMEZONE),
} as const;

export const hasSupabase = Boolean(env.supabaseUrl && env.supabaseAnonKey);
export const isDemoMode = !IS_PRODUCTION && (env.dataMode === 'demo' || !hasSupabase);
