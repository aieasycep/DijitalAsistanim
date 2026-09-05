/** Android notification privacy guard: authenticator / password-manager apps and OTP contents never leave the device. */
import type { NotificationInput, SensitiveNotificationResult } from './types';

export const DEFAULT_EXCLUDED_PACKAGES: readonly string[] = [
  'com.google.android.apps.authenticator2',
  'com.authy.authy',
  'com.lastpass.lpandroid',
  'com.x8bit.bitwarden',
  'com.onepassword.android',
  'com.agilebits.onepassword',
  'com.microsoft.authenticator',
  'com.azure.authenticator',
  'com.duosecurity.duomobile',
  'com.okta.android.auth',
  'com.dashlane',
  'com.callpod.android_apps.keeper',
  'com.nordpass.android.app',
  'com.google.android.gms.auth',
  'com.twofasapp',
  'org.fedorahosted.freeotp',
  'com.beemdevelopment.aegis',
  'com.yubico.yubioath',
  'com.enpass.app',
  'com.roboform',
  'com.samsung.android.authfw',
  'com.samsung.android.samsungpass',
];

const SENSITIVE_PACKAGE_PATTERN = /(?:authenticator|password|passwd|otp|2fa|totp|passkey|vault|keychain|keeper|bitwarden|lastpass|1password|dashlane)/i;

const OTP_KEYWORDS = new RegExp(
  '(?<![\\p{L}])(?:doğrulama kodu|onay kodu|giriş kodu|güvenlik kodu|tek kullanımlık|kodunuz|kodun|şifreniz|parolanız|verification code|security code|login code|one[- ]time (?:code|password|passcode)|otp|2fa|passcode|your code|code is|pin kodu|your pin|sms kodu)[a-zçğıöşü]{0,4}(?![\\p{L}])',
  'iu',
);
const CODE_TOKEN = /(?<![\d-])\d{3}[\s-]?\d{3}(?![\d-])|(?<!\d)\d{4,8}(?!\d)/u;
const NON_OTP_CONTEXT = /(?:sipariş|order|kargo|takip|tracking|indirim|kupon|coupon|promosyon|referans|reference|rezervasyon|pnr|fatura|invoice|abone|müşteri no|customer)/iu;
const CREDENTIAL = /(?:şifreniz|parolanız|your password|password is|şifreniz:|parola:|password:)/iu;

export function isSensitiveNotification(input: NotificationInput, opts: { excludedPackages?: readonly string[] } = {}): SensitiveNotificationResult {
  const pkg = input.packageName.trim().toLowerCase();
  const excluded = opts.excludedPackages ?? DEFAULT_EXCLUDED_PACKAGES;
  if (excluded.some((p) => p.toLowerCase() === pkg) || SENSITIVE_PACKAGE_PATTERN.test(pkg)) {
    return { sensitive: true, reason: 'excluded_package' };
  }
  const content = `${input.title}\n${input.text}`;
  if (CREDENTIAL.test(content)) return { sensitive: true, reason: 'credential' };
  if (OTP_KEYWORDS.test(content) && CODE_TOKEN.test(content) && !NON_OTP_CONTEXT.test(content)) {
    return { sensitive: true, reason: 'otp' };
  }
  return { sensitive: false, reason: null };
}
