/**
 * Typed access to Edge Function secrets. Every secret is optional at runtime — features degrade
 * gracefully (device TTS instead of server TTS, polling instead of webhooks, FTS instead of vectors)
 * — except the Supabase/service-role/encryption keys required for anything to work at all.
 */
export interface FunctionEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
  serviceRoleKey: string;
  internalSecret: string;
  tokenEncryptionKey: string;
  tokenEncryptionKeyPrevious?: string;
  webUrl: string;
  appScheme: string;
  google: {
    clientId?: string;
    clientSecret?: string;
    redirectUri?: string;
    pubsubTopic?: string;
    pubsubVerificationToken?: string;
  };
  microsoft: {
    clientId?: string;
    clientSecret?: string;
    tenant: string;
    redirectUri?: string;
    webhookUrl?: string;
    webhookClientState?: string;
  };
  ai: {
    provider: 'anthropic' | 'openai';
    fallbackProvider?: 'anthropic' | 'openai';
    anthropicApiKey?: string;
    anthropicModelSmall: string;
    anthropicModelLarge: string;
    openaiApiKey?: string;
    openaiModelSmall: string;
    openaiModelLarge: string;
    maxInputTokensPerCall: number;
    dailyTokenBudgetFree: number;
    dailyTokenBudgetPro: number;
  };
  embeddings: {
    provider: 'openai' | 'voyage' | 'none';
    model: string;
    dimensions: number;
    voyageApiKey?: string;
  };
  tts: {
    provider: 'none' | 'openai' | 'elevenlabs';
    voice: string;
    elevenLabsApiKey?: string;
    elevenLabsVoiceId?: string;
  };
  stt: { provider: 'none' | 'openai' | 'deepgram'; deepgramApiKey?: string };
  revenuecat: { webhookSecret?: string; secretApiKey?: string; entitlementId: string };
  expoAccessToken?: string;
  sentryDsn?: string;
  posthog: { key?: string; host: string };
  routes: { provider: 'none' | 'google'; googleApiKey?: string };
  cronSecret?: string;
  supportEmail: string;
}

const read = (key: string): string | undefined => {
  const v = Deno.env.get(key);
  return v === undefined || v === '' ? undefined : v;
};
const must = (key: string): string => {
  const v = read(key);
  if (!v) throw new Error(`Missing required environment variable: ${key}`);
  return v;
};
const num = (key: string, fallback: number): number => {
  const v = read(key);
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
};
const oneOf = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  const v = read(key) as T | undefined;
  return v && allowed.includes(v) ? v : fallback;
};

let cached: FunctionEnv | null = null;

export function getEnv(): FunctionEnv {
  if (cached) return cached;
  const supabaseUrl = read('SUPABASE_URL') ?? must('EXPO_PUBLIC_SUPABASE_URL');
  cached = {
    supabaseUrl,
    supabaseAnonKey: read('SUPABASE_ANON_KEY') ?? must('EXPO_PUBLIC_SUPABASE_ANON_KEY'),
    serviceRoleKey: must('SUPABASE_SERVICE_ROLE_KEY'),
    internalSecret: read('INTERNAL_FUNCTION_SECRET') ?? read('CRON_SECRET') ?? '',
    tokenEncryptionKey: must('TOKEN_ENCRYPTION_KEY'),
    tokenEncryptionKeyPrevious: read('TOKEN_ENCRYPTION_KEY_PREVIOUS'),
    webUrl: read('WEB_URL') ?? 'https://dijitalasistan.app',
    appScheme: read('APP_SCHEME') ?? 'dijitalasistan',
    google: {
      clientId: read('GOOGLE_OAUTH_CLIENT_ID'),
      clientSecret: read('GOOGLE_OAUTH_CLIENT_SECRET'),
      redirectUri:
        read('GOOGLE_OAUTH_REDIRECT_URI') ?? `${supabaseUrl}/functions/v1/oauth-google-callback`,
      pubsubTopic: read('GOOGLE_PUBSUB_TOPIC'),
      pubsubVerificationToken: read('GOOGLE_PUBSUB_VERIFICATION_TOKEN'),
    },
    microsoft: {
      clientId: read('MICROSOFT_OAUTH_CLIENT_ID'),
      clientSecret: read('MICROSOFT_OAUTH_CLIENT_SECRET'),
      tenant: read('MICROSOFT_OAUTH_TENANT') ?? 'common',
      redirectUri:
        read('MICROSOFT_OAUTH_REDIRECT_URI') ??
        `${supabaseUrl}/functions/v1/oauth-microsoft-callback`,
      webhookUrl:
        read('MICROSOFT_GRAPH_WEBHOOK_URL') ?? `${supabaseUrl}/functions/v1/webhook-microsoft`,
      webhookClientState: read('MICROSOFT_GRAPH_WEBHOOK_CLIENT_STATE'),
    },
    ai: {
      provider: oneOf('AI_PROVIDER', ['anthropic', 'openai'] as const, 'anthropic'),
      fallbackProvider: read('AI_FALLBACK_PROVIDER') as 'anthropic' | 'openai' | undefined,
      anthropicApiKey: read('ANTHROPIC_API_KEY'),
      anthropicModelSmall: read('ANTHROPIC_MODEL_SMALL') ?? 'claude-haiku-4-5-20251001',
      anthropicModelLarge: read('ANTHROPIC_MODEL_LARGE') ?? 'claude-sonnet-5',
      openaiApiKey: read('OPENAI_API_KEY'),
      openaiModelSmall: read('OPENAI_MODEL_SMALL') ?? 'gpt-5-mini',
      openaiModelLarge: read('OPENAI_MODEL_LARGE') ?? 'gpt-5',
      maxInputTokensPerCall: num('AI_MAX_INPUT_TOKENS_PER_CALL', 12000),
      dailyTokenBudgetFree: num('AI_DAILY_TOKEN_BUDGET_FREE', 60000),
      dailyTokenBudgetPro: num('AI_DAILY_TOKEN_BUDGET_PRO', 1500000),
    },
    embeddings: {
      provider: oneOf('EMBEDDING_PROVIDER', ['openai', 'voyage', 'none'] as const, 'none'),
      model: read('EMBEDDING_MODEL') ?? 'text-embedding-3-small',
      dimensions: num('EMBEDDING_DIMENSIONS', 1536),
      voyageApiKey: read('VOYAGE_API_KEY'),
    },
    tts: {
      provider: oneOf('TTS_PROVIDER', ['none', 'openai', 'elevenlabs'] as const, 'none'),
      voice: read('TTS_VOICE') ?? 'alloy',
      elevenLabsApiKey: read('ELEVENLABS_API_KEY'),
      elevenLabsVoiceId: read('ELEVENLABS_VOICE_ID'),
    },
    stt: {
      provider: oneOf('STT_PROVIDER', ['none', 'openai', 'deepgram'] as const, 'none'),
      deepgramApiKey: read('DEEPGRAM_API_KEY'),
    },
    revenuecat: {
      webhookSecret: read('REVENUECAT_WEBHOOK_SECRET'),
      secretApiKey: read('REVENUECAT_SECRET_API_KEY'),
      entitlementId: read('EXPO_PUBLIC_RC_ENTITLEMENT_ID') ?? 'pro',
    },
    expoAccessToken: read('EXPO_ACCESS_TOKEN'),
    sentryDsn: read('SENTRY_DSN'),
    posthog: {
      key: read('POSTHOG_KEY') ?? read('EXPO_PUBLIC_POSTHOG_KEY'),
      host: read('POSTHOG_HOST') ?? 'https://eu.i.posthog.com',
    },
    routes: {
      provider: oneOf('ROUTES_PROVIDER', ['none', 'google'] as const, 'none'),
      googleApiKey: read('GOOGLE_ROUTES_API_KEY'),
    },
    cronSecret: read('CRON_SECRET'),
    supportEmail: read('SUPPORT_EMAIL') ?? 'destek@dijitalasistan.app',
  };
  return cached;
}

/** Whether a Google/Microsoft OAuth client is configured (otherwise oauth-start returns a clear error). */
export function hasOAuthClient(provider: 'google' | 'microsoft'): boolean {
  const env = getEnv();
  const c = provider === 'google' ? env.google : env.microsoft;
  return Boolean(c.clientId && c.clientSecret);
}
