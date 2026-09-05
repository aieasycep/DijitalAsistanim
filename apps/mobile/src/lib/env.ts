import Constants from 'expo-constants';

/**
 * Public runtime configuration (EXPO_PUBLIC_* only — never secrets).
 * Demo mode is only honoured in non-production builds (see @da/api-client resolveMode).
 */
const extra = (Constants.expoConfig?.extra ?? {}) as { isProduction?: boolean; appGroup?: string; universalHosts?: string[] };

const pub = (key: string): string | undefined => {
  const v = process.env[key];
  return v && v.length > 0 ? v : undefined;
};

export const IS_PRODUCTION = Boolean(extra.isProduction) || process.env.NODE_ENV === 'production';

export const env = {
  dataMode: (pub('EXPO_PUBLIC_DATA_MODE') as 'demo' | 'supabase' | undefined) ?? (IS_PRODUCTION ? 'supabase' : 'demo'),
  supabaseUrl: pub('EXPO_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: pub('EXPO_PUBLIC_SUPABASE_ANON_KEY'),
  webUrl: pub('EXPO_PUBLIC_WEB_URL') ?? 'https://dijitalasistan.app',
  appScheme: pub('EXPO_PUBLIC_APP_SCHEME') ?? 'dijitalasistan',
  demoUserName: pub('EXPO_PUBLIC_DEMO_USER_NAME') ?? 'Yunus',
  revenueCatIosKey: pub('EXPO_PUBLIC_REVENUECAT_IOS_KEY'),
  revenueCatAndroidKey: pub('EXPO_PUBLIC_REVENUECAT_ANDROID_KEY'),
  rcEntitlementId: pub('EXPO_PUBLIC_RC_ENTITLEMENT_ID') ?? 'pro',
  rcProductMonthly: pub('EXPO_PUBLIC_RC_PRODUCT_MONTHLY') ?? 'da_pro_monthly',
  rcProductAnnual: pub('EXPO_PUBLIC_RC_PRODUCT_ANNUAL') ?? 'da_pro_annual',
  sentryDsn: pub('EXPO_PUBLIC_SENTRY_DSN'),
  posthogKey: pub('EXPO_PUBLIC_POSTHOG_KEY'),
  posthogHost: pub('EXPO_PUBLIC_POSTHOG_HOST') ?? 'https://eu.i.posthog.com',
  easProjectId: pub('EXPO_PUBLIC_EAS_PROJECT_ID'),
  googleIosClientId: pub('EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID'),
  googleAndroidClientId: pub('EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID'),
  googleWebClientId: pub('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID'),
  appGroup: extra.appGroup ?? 'group.com.dijitalasistan.app',
  universalHosts: extra.universalHosts ?? ['dijitalasistan.app'],
  appVersion: Constants.expoConfig?.version ?? '1.0.0',
  isProduction: IS_PRODUCTION,
} as const;

export const hasSupabase = Boolean(env.supabaseUrl && env.supabaseAnonKey);
export const isDemoMode = !IS_PRODUCTION && (env.dataMode === 'demo' || !hasSupabase);
