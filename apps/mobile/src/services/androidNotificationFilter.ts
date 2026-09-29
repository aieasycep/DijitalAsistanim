/**
 * Pure, platform-free mirror of the on-device notification guard
 * (modules/notification-listener/android/…/NotificationFilter.kt) and of the server-side
 * `isSensitiveNotification` in @da/server-core. Runs as the second line of defence before anything is
 * uploaded, so a native regression can never leak a one-time code.
 */
import type { AndroidNotificationScope } from '@da/domain';

/** Max items per `androidNotifications.ingest` call (androidNotificationIngestSchema). */
export const MAX_INGEST_BATCH = 100;
/** Fingerprints remembered for de-duplication. */
export const MAX_SEEN_FINGERPRINTS = 500;
/** Items kept in memory for the settings preview when upload consent is off. */
export const MAX_LOCAL_ITEMS = 200;

export const DEFAULT_EXCLUDED_PACKAGES: readonly string[] = [
  // Authenticators
  'com.google.android.apps.authenticator2',
  'com.microsoft.authenticator',
  'com.azure.authenticator',
  'com.authy.authy',
  'com.twofasapp',
  'org.fedorahosted.freeotp',
  'com.beemdevelopment.aegis',
  'com.duosecurity.duomobile',
  'com.okta.android.auth',
  'com.yubico.yubioath',
  'com.samsung.android.authfw',
  // Password managers
  'com.lastpass.lpandroid',
  'com.x8bit.bitwarden',
  'com.onepassword.android',
  'com.agilebits.onepassword',
  'com.dashlane',
  'com.callpod.android_apps.keeper',
  'com.keepersecurity',
  'com.nordpass.android.app',
  'com.nordpass.android.app.password.manager',
  'com.enpass.app',
  'com.roboform',
  'com.samsung.android.samsungpass',
  // OTP autofill / SMS retriever
  'com.google.android.gms',
  'com.google.android.gms.auth',
  // Banking & payment apps (OTP and transaction pushes)
  'com.garanti.cepsubesi',
  'com.ykb.android',
  'com.akbank.android.apps.akbank_direkt',
  'com.pozitron.iscep',
  'com.ziraat.ziraatmobil',
  'com.vakifbank.mobile',
  'com.finansbank.mobile.cepsube',
  'com.denizbank.mobildeniz',
  'com.teb',
  'com.ingbanktr.ingmobil',
  'com.tmobtech.halkbank',
  'com.kuveytturk.mobil',
  'com.magiclick.odeabank',
  'tr.com.sekerbilisim.mbank',
  'com.hsbc.hsbcturkey',
  'com.papara.app',
];

export const MESSAGING_PACKAGES: readonly string[] = [
  'com.google.android.apps.messaging',
  'com.samsung.android.messaging',
  'com.android.mms',
  'com.android.messaging',
  'com.whatsapp',
  'com.whatsapp.w4b',
  'org.telegram.messenger',
  'org.telegram.messenger.web',
  'org.thoughtcrime.securesms',
  'com.viber.voip',
  'com.facebook.orca',
  'com.facebook.mlite',
  'com.discord',
  'com.skype.raider',
  'com.google.android.apps.dynamite',
  'com.slack',
  'com.turkcell.bip',
  'jp.naver.line.android',
  'com.tencent.mm',
  'com.imo.android.imoim',
  'com.snapchat.android',
];

const EXCLUDED = new Set(DEFAULT_EXCLUDED_PACKAGES);
const MESSAGING = new Set(MESSAGING_PACKAGES);

const SENSITIVE_PACKAGE_PATTERN =
  /(?:authenticator|password|passwd|otp|2fa|totp|passkey|vault|keychain|keeper|bitwarden|lastpass|1password|dashlane|bank|banka)/i;

// Content patterns run on `foldText()` output: lower-case, Turkish letters mapped to ASCII.
const OTP_KEYWORDS =
  /(?:^|[^a-z])(?:kod(?:u|un|unu|unuz)?|codes?|otp|2fa|pin(?:i|in)?|passcode|dogrulama|verification|verify|sifre(?:niz|n|si)?|parola(?:niz|n|si)?|passwords?|tek kullanimlik|one[ -]time|guvenlik kodu|security code|onay kodu|giris kodu|login code)(?:$|[^a-z])/;
const CODE_TOKEN =
  /(?:^|[^0-9-])[0-9]{3}[ -]?[0-9]{3}(?:$|[^0-9-])|(?:^|[^0-9])[0-9]{4,8}(?:$|[^0-9])/;
const CREDENTIAL = /(?:sifreniz|parolaniz|your password|password is|password:|parola:|sifre:)/;

const TURKISH_FOLD: ReadonlyArray<readonly [RegExp, string]> = [
  [/̇/g, ''],
  [/ı/g, 'i'],
  [/ş/g, 's'],
  [/ğ/g, 'g'],
  [/ç/g, 'c'],
  [/ö/g, 'o'],
  [/ü/g, 'u'],
  [/â/g, 'a'],
  [/î/g, 'i'],
  [/û/g, 'u'],
];

export type SensitiveReason = 'excluded_package' | 'credential' | 'otp';

export interface NotificationFilterInput {
  packageName: string;
  title: string;
  text: string;
}

export interface NotificationFilterConfig {
  scope: AndroidNotificationScope;
  allowedPackages: readonly string[];
}

export interface SensitiveCheck {
  sensitive: boolean;
  reason: SensitiveReason | null;
}

export type FilterDecision =
  { accepted: true } | { accepted: false; reason: SensitiveReason | 'not_allowed' };

/** Lower-cases and maps Turkish letters to ASCII (identical to NotificationFilter.fold in Kotlin). */
export function foldText(input: string): string {
  let out = input.replace(/İ/g, 'i').toLowerCase();
  for (const [pattern, replacement] of TURKISH_FOLD) out = out.replace(pattern, replacement);
  return out;
}

function normalizePackage(packageName: string): string {
  return packageName.trim().toLowerCase();
}

export function isDefaultExcludedPackage(packageName: string): boolean {
  const pkg = normalizePackage(packageName);
  return EXCLUDED.has(pkg) || SENSITIVE_PACKAGE_PATTERN.test(pkg);
}

export function isMessagingPackage(packageName: string): boolean {
  return MESSAGING.has(normalizePackage(packageName));
}

/** True when the content looks like a one-time code / credential (or the app is excluded). */
export function isSensitiveNotification(input: NotificationFilterInput): SensitiveCheck {
  if (isDefaultExcludedPackage(input.packageName)) {
    return { sensitive: true, reason: 'excluded_package' };
  }
  const content = foldText(`${input.title}\n${input.text}`);
  if (CREDENTIAL.test(content)) return { sensitive: true, reason: 'credential' };
  if (OTP_KEYWORDS.test(content) && CODE_TOKEN.test(content)) {
    return { sensitive: true, reason: 'otp' };
  }
  return { sensitive: false, reason: null };
}

/** Scope / allow-list rule: excluded apps never, messaging apps only when explicitly allowed. */
export function isPackageAllowed(packageName: string, config: NotificationFilterConfig): boolean {
  const pkg = normalizePackage(packageName);
  if (isDefaultExcludedPackage(pkg)) return false;
  const explicitlyAllowed = config.allowedPackages.some(
    (allowed) => normalizePackage(allowed) === pkg,
  );
  if (config.scope === 'selected') return explicitlyAllowed;
  return explicitlyAllowed || !isMessagingPackage(pkg);
}

export function filterNotification(
  input: NotificationFilterInput,
  config: NotificationFilterConfig,
): FilterDecision {
  const sensitive = isSensitiveNotification(input);
  if (sensitive.sensitive && sensitive.reason) return { accepted: false, reason: sensitive.reason };
  if (!isPackageAllowed(input.packageName, config))
    return { accepted: false, reason: 'not_allowed' };
  return { accepted: true };
}

/** Drops items whose fingerprint was already seen (and duplicates inside the batch itself). */
export function dedupeByFingerprint<T extends { fingerprint: string }>(
  items: readonly T[],
  seen: ReadonlySet<string>,
): T[] {
  const inBatch = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.fingerprint) || inBatch.has(item.fingerprint)) continue;
    inBatch.add(item.fingerprint);
    out.push(item);
  }
  return out;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const step = Math.max(1, Math.floor(size));
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += step) {
    out.push(items.slice(index, index + step));
  }
  return out;
}

/** Bounded, insertion-ordered set of fingerprints (oldest evicted first). */
export class FingerprintMemory {
  private readonly order: string[] = [];
  private readonly set = new Set<string>();

  constructor(
    initial: readonly string[] = [],
    private readonly capacity: number = MAX_SEEN_FINGERPRINTS,
  ) {
    for (const fingerprint of initial) this.add(fingerprint);
  }

  has(fingerprint: string): boolean {
    return this.set.has(fingerprint);
  }

  /** Returns `true` when the fingerprint was new. */
  add(fingerprint: string): boolean {
    if (this.set.has(fingerprint)) return false;
    this.set.add(fingerprint);
    this.order.push(fingerprint);
    while (this.order.length > this.capacity) {
      const oldest = this.order.shift();
      if (oldest !== undefined) this.set.delete(oldest);
    }
    return true;
  }

  get size(): number {
    return this.set.size;
  }

  toArray(): string[] {
    return [...this.order];
  }
}
