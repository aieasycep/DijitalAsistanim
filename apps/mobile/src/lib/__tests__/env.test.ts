/**
 * `IS_PRODUCTION` / `isDemoMode` resolution: the embedded app config (APP_ENV / EAS profile) decides,
 * NODE_ENV only fills in when no config is embedded. Release-configured demo builds (EAS `demo`, the
 * Android APK workflow) bundle with NODE_ENV=production and must still honour demo mode; store builds
 * must refuse it no matter what the env says.
 */
import type * as EnvNamespace from '../env';

type EnvModule = typeof EnvNamespace;

function loadEnv(options: {
  extra?: Record<string, unknown>;
  nodeEnv: 'production' | 'development' | 'test';
  vars?: Record<string, string>;
}): EnvModule {
  const keys = ['NODE_ENV', ...Object.keys(options.vars ?? {})];
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  process.env.NODE_ENV = options.nodeEnv;
  for (const [key, value] of Object.entries(options.vars ?? {})) process.env[key] = value;
  let mod: EnvModule | undefined;
  jest.isolateModules(() => {
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: {
        expoConfig: options.extra === undefined ? null : { version: '1.0.0', extra: options.extra },
      },
    }));
    mod = require('../env') as EnvModule;
  });
  for (const [key, value] of previous) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  if (!mod) throw new Error('env module did not load');
  return mod;
}

describe('env production / demo resolution', () => {
  it('honours demo mode in a release-configured internal build (NODE_ENV=production)', () => {
    const env = loadEnv({
      extra: { isProduction: false },
      nodeEnv: 'production',
      vars: { EXPO_PUBLIC_DATA_MODE: 'demo' },
    });
    expect(env.IS_PRODUCTION).toBe(false);
    expect(env.isDemoMode).toBe(true);
  });

  it('refuses demo mode in a store build even when the env asks for it', () => {
    const env = loadEnv({
      extra: { isProduction: true },
      nodeEnv: 'production',
      vars: { EXPO_PUBLIC_DATA_MODE: 'demo' },
    });
    expect(env.IS_PRODUCTION).toBe(true);
    expect(env.isDemoMode).toBe(false);
    expect(env.env.dataMode).toBe('demo');
  });

  it('falls back to NODE_ENV when no config is embedded', () => {
    expect(loadEnv({ nodeEnv: 'production' }).IS_PRODUCTION).toBe(true);
    expect(loadEnv({ nodeEnv: 'development' }).IS_PRODUCTION).toBe(false);
  });

  it('uses demo when a non-production build has no Supabase configuration', () => {
    const env = loadEnv({
      extra: { isProduction: false },
      nodeEnv: 'production',
      vars: { EXPO_PUBLIC_DATA_MODE: '', EXPO_PUBLIC_SUPABASE_URL: '' },
    });
    expect(env.hasSupabase).toBe(false);
    expect(env.isDemoMode).toBe(true);
  });
});
