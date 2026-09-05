package com.dijitalasistan.notificationlistener

import java.util.Locale

/**
 * On-device privacy guard. Kept in lock-step with apps/mobile/src/services/androidNotificationFilter.ts
 * (second line of defence before upload) and packages/server-core/src/triage/notifications.ts (server side).
 *
 * Rules:
 *  1. Authenticator / password-manager / banking / OTP-autofill packages are NEVER captured.
 *  2. Messaging (SMS / IM) apps are captured only when explicitly allow-listed.
 *  3. Content that looks like a one-time code or a credential is NEVER captured, whatever the app.
 */
object NotificationFilter {
  val DEFAULT_EXCLUDED_PACKAGES: Set<String> = setOf(
    // Authenticators
    "com.google.android.apps.authenticator2",
    "com.microsoft.authenticator",
    "com.azure.authenticator",
    "com.authy.authy",
    "com.twofasapp",
    "org.fedorahosted.freeotp",
    "com.beemdevelopment.aegis",
    "com.duosecurity.duomobile",
    "com.okta.android.auth",
    "com.yubico.yubioath",
    "com.samsung.android.authfw",
    // Password managers
    "com.lastpass.lpandroid",
    "com.x8bit.bitwarden",
    "com.onepassword.android",
    "com.agilebits.onepassword",
    "com.dashlane",
    "com.callpod.android_apps.keeper",
    "com.keepersecurity",
    "com.nordpass.android.app",
    "com.nordpass.android.app.password.manager",
    "com.enpass.app",
    "com.roboform",
    "com.samsung.android.samsungpass",
    // OTP autofill / SMS retriever
    "com.google.android.gms",
    "com.google.android.gms.auth",
    // Banking & payment apps (OTP and transaction pushes)
    "com.garanti.cepsubesi",
    "com.ykb.android",
    "com.akbank.android.apps.akbank_direkt",
    "com.pozitron.iscep",
    "com.ziraat.ziraatmobil",
    "com.vakifbank.mobile",
    "com.finansbank.mobile.cepsube",
    "com.denizbank.mobildeniz",
    "com.teb",
    "com.ingbanktr.ingmobil",
    "com.tmobtech.halkbank",
    "com.kuveytturk.mobil",
    "com.magiclick.odeabank",
    "tr.com.sekerbilisim.mbank",
    "com.hsbc.hsbcturkey",
    "com.papara.app",
  )

  val MESSAGING_PACKAGES: Set<String> = setOf(
    "com.google.android.apps.messaging",
    "com.samsung.android.messaging",
    "com.android.mms",
    "com.android.messaging",
    "com.whatsapp",
    "com.whatsapp.w4b",
    "org.telegram.messenger",
    "org.telegram.messenger.web",
    "org.thoughtcrime.securesms",
    "com.viber.voip",
    "com.facebook.orca",
    "com.facebook.mlite",
    "com.discord",
    "com.skype.raider",
    "com.google.android.apps.dynamite",
    "com.slack",
    "com.turkcell.bip",
    "jp.naver.line.android",
    "com.tencent.mm",
    "com.imo.android.imoim",
    "com.snapchat.android",
  )

  private val SENSITIVE_PACKAGE_PATTERN = Regex(
    "(?:authenticator|password|passwd|otp|2fa|totp|passkey|vault|keychain|keeper|bitwarden|lastpass|1password|dashlane|bank|banka)",
    RegexOption.IGNORE_CASE,
  )

  // All content patterns run on `fold()`ed text: lower-case, Turkish letters mapped to ASCII.
  private val OTP_KEYWORDS = Regex(
    "(?:^|[^a-z])(?:kod(?:u|un|unu|unuz)?|codes?|otp|2fa|pin(?:i|in)?|passcode|dogrulama|verification|verify|" +
      "sifre(?:niz|n|si)?|parola(?:niz|n|si)?|passwords?|tek kullanimlik|one[ -]time|guvenlik kodu|security code|" +
      "onay kodu|giris kodu|login code)(?:$|[^a-z])",
  )
  private val CODE_TOKEN = Regex(
    "(?:^|[^0-9-])[0-9]{3}[ -]?[0-9]{3}(?:$|[^0-9-])|(?:^|[^0-9])[0-9]{4,8}(?:$|[^0-9])",
  )
  private val CREDENTIAL = Regex("(?:sifreniz|parolaniz|your password|password is|password:|parola:|sifre:)")

  fun isDefaultExcluded(packageName: String): Boolean {
    val pkg = packageName.trim().lowercase(Locale.ROOT)
    return pkg in DEFAULT_EXCLUDED_PACKAGES || SENSITIVE_PACKAGE_PATTERN.containsMatchIn(pkg)
  }

  fun isMessaging(packageName: String): Boolean =
    packageName.trim().lowercase(Locale.ROOT) in MESSAGING_PACKAGES

  /** True when the notification body looks like a one-time code or a credential. */
  fun isSensitiveContent(title: String, text: String): Boolean {
    val content = fold(title + "\n" + text)
    if (CREDENTIAL.containsMatchIn(content)) return true
    return OTP_KEYWORDS.containsMatchIn(content) && CODE_TOKEN.containsMatchIn(content)
  }

  fun isPackageAllowed(packageName: String, config: ListenerConfig): Boolean {
    val pkg = packageName.trim().lowercase(Locale.ROOT)
    if (isDefaultExcluded(pkg)) return false
    val explicitlyAllowed = pkg in config.allowedPackages
    return when (config.scope) {
      ListenerScope.SELECTED -> explicitlyAllowed
      ListenerScope.ALL_ALLOWED -> explicitlyAllowed || !isMessaging(pkg)
    }
  }

  /** Lower-cases and maps Turkish letters to ASCII so keyword patterns stay simple and locale-proof. */
  fun fold(input: String): String {
    val lowered = input.replace('İ', 'i').lowercase(Locale.ROOT)
    val out = StringBuilder(lowered.length)
    for (ch in lowered) {
      when (ch) {
        '̇' -> {} // combining dot above (left over from a decomposed İ)
        'ı' -> out.append('i')
        'ş' -> out.append('s')
        'ğ' -> out.append('g')
        'ç' -> out.append('c')
        'ö' -> out.append('o')
        'ü' -> out.append('u')
        'â' -> out.append('a')
        'î' -> out.append('i')
        'û' -> out.append('u')
        else -> out.append(ch)
      }
    }
    return out.toString()
  }
}
