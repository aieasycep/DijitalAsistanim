/**
 * Web destinations, support address and build information used by Help / Feedback / Settings.
 * Every URL derives from `env.webUrl` so staging builds never point at production pages.
 */
import { Platform } from 'react-native';
import * as Application from 'expo-application';
import { env } from '@/lib/env';

const base = env.webUrl.replace(/\/$/, '');

export const webLinks = {
  docs: `${base}/help`,
  status: `${base}/status`,
  privacy: `${base}/privacy`,
  terms: `${base}/terms`,
  releaseNotes: `${base}/changelog`,
} as const;

export function webHost(): string {
  return base.replace(/^https?:\/\//i, '').replace(/[/:].*$/, '');
}

export const supportEmail = `destek@${webHost()}`;

export function supportMailto(subject: string, body: string): string {
  return `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export type AppPlatform = 'ios' | 'android' | 'web';

export interface AppInfo {
  version: string;
  build: string | null;
  platform: AppPlatform;
}

/** Native app version/build (falls back to the config version in Expo Go / tests). */
export function appInfo(): AppInfo {
  let version: string | null = null;
  let build: string | null = null;
  try {
    version = Application.nativeApplicationVersion;
    build = Application.nativeBuildVersion;
  } catch {
    version = null;
    build = null;
  }
  const platform: AppPlatform =
    Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'web';
  return { version: version || env.appVersion, build: build || null, platform };
}

/** "1.0.0 (240)" or "1.0.0" */
export function appVersionLabel(): string {
  const { version, build } = appInfo();
  return build ? `${version} (${build})` : version;
}
