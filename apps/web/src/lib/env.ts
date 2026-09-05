/**
 * Environment access for the website. Public values are inlined at build time (NEXT_PUBLIC_*);
 * everything else is read on the server only. Missing values degrade gracefully — no dead links.
 */

function clean(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v && v.length > 0 ? v : undefined;
}

export const publicEnv = {
  webUrl: clean(process.env.NEXT_PUBLIC_WEB_URL) ?? 'https://dijitalasistan.app',
  appStoreUrl: clean(process.env.NEXT_PUBLIC_APP_STORE_URL),
  playStoreUrl: clean(process.env.NEXT_PUBLIC_PLAY_STORE_URL),
} as const;

export function serverEnv() {
  return {
    iosBundleId: clean(process.env.IOS_BUNDLE_ID) ?? 'com.dijitalasistan.app',
    androidPackage: clean(process.env.ANDROID_PACKAGE) ?? 'com.dijitalasistan.app',
    appleTeamId: clean(process.env.APPLE_TEAM_ID),
    androidSha256Fingerprints: (clean(process.env.ANDROID_SHA256_CERT_FINGERPRINTS) ?? '')
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(s)),
    supportEmail: clean(process.env.SUPPORT_EMAIL) ?? 'destek@dijitalasistan.app',
    privacyEmail: clean(process.env.PRIVACY_EMAIL) ?? 'gizlilik@dijitalasistan.app',
  };
}

export const SITE = {
  name: 'Dijital Asistan',
  legalEntity: 'Dijital Asistan',
  supportEmail: 'destek@dijitalasistan.app',
  privacyEmail: 'gizlilik@dijitalasistan.app',
  lastUpdated: '2026-09-05',
} as const;
