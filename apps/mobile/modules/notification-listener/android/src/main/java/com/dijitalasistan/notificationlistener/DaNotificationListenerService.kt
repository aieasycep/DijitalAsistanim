package com.dijitalasistan.notificationlistener

import android.app.Notification
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import java.security.MessageDigest
import java.time.Instant
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

private const val TAG = "DaNotificationListener"
private const val MAX_TITLE_LENGTH = 300
private const val MAX_TEXT_LENGTH = 2000
private const val MAX_APP_NAME_LENGTH = 120

/** Notification categories that are never useful signals (media, progress bars, system status, navigation…). */
private val IGNORED_CATEGORIES = setOf(
  "transport",
  "service",
  "progress",
  "sys",
  "status",
  "navigation",
  "stopwatch",
  "workout",
  "location_sharing",
)

/**
 * System-bound listener. Normalises posted notifications, applies [NotificationFilter] and hands accepted
 * items to [NotificationBus]. It never stores notification content on disk and never forwards anything
 * that looks like a one-time code or comes from an excluded / non-allow-listed app.
 */
class DaNotificationListenerService : NotificationListenerService() {
  private val labelCache = HashMap<String, String>()

  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    val posted = sbn ?: return
    try {
      handle(posted)
    } catch (error: Throwable) {
      Log.w(TAG, "Notification skipped: ${error.javaClass.simpleName}")
    }
  }

  private fun handle(sbn: StatusBarNotification) {
    val context = applicationContext
    val config = NotificationStore.getConfig(context)
    if (!config.enabled) return

    val packageName = sbn.packageName ?: return
    if (packageName == context.packageName) return
    val notification = sbn.notification ?: return
    if (shouldIgnore(sbn, notification)) return
    if (!NotificationFilter.isPackageAllowed(packageName, config)) return

    val extras = notification.extras ?: return
    val title = truncate(
      charSequence(extras, Notification.EXTRA_TITLE) ?: charSequence(extras, Notification.EXTRA_TITLE_BIG) ?: "",
      MAX_TITLE_LENGTH,
    )
    val text = truncate(bodyText(extras), MAX_TEXT_LENGTH)
    if (title.isBlank() && text.isBlank()) return
    if (NotificationFilter.isSensitiveContent(title, text)) return

    NotificationBus.publish(
      CapturedNotification(
        packageName = packageName,
        appName = appLabel(packageName),
        title = title,
        text = text,
        postedAt = isoUtc(sbn.postTime),
        fingerprint = fingerprint(packageName, title, text, sbn.postTime),
      ),
    )
  }

  private fun shouldIgnore(sbn: StatusBarNotification, notification: Notification): Boolean {
    if (sbn.isOngoing) return true
    val flags = notification.flags
    if (flags and Notification.FLAG_FOREGROUND_SERVICE != 0) return true
    if (flags and Notification.FLAG_ONGOING_EVENT != 0) return true
    if (flags and Notification.FLAG_GROUP_SUMMARY != 0) return true
    if (notification.visibility == Notification.VISIBILITY_SECRET) return true
    val category = notification.category
    if (category != null && category in IGNORED_CATEGORIES) return true
    val extras = notification.extras ?: return false
    if (extras.containsKey(Notification.EXTRA_MEDIA_SESSION)) return true
    val template = extras.getString(Notification.EXTRA_TEMPLATE)
    return template != null && template.contains("MediaStyle")
  }

  private fun bodyText(extras: Bundle): String {
    charSequence(extras, Notification.EXTRA_BIG_TEXT)?.let { return it }
    charSequence(extras, Notification.EXTRA_TEXT)?.let { return it }
    val lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)
    if (lines != null && lines.isNotEmpty()) {
      val joined = lines.mapNotNull { it?.toString()?.trim() }.filter { it.isNotEmpty() }.joinToString("\n")
      if (joined.isNotEmpty()) return joined
    }
    return charSequence(extras, Notification.EXTRA_SUB_TEXT) ?: ""
  }

  private fun charSequence(extras: Bundle, key: String): String? {
    val value = extras.getCharSequence(key)?.toString()?.trim()
    return if (value.isNullOrEmpty()) null else value
  }

  private fun truncate(value: String, max: Int): String =
    if (value.length <= max) value else value.substring(0, max)

  private fun appLabel(packageName: String): String {
    labelCache[packageName]?.let { return it }
    val pm = packageManager
    val label = try {
      val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        pm.getApplicationInfo(packageName, PackageManager.ApplicationInfoFlags.of(0L))
      } else {
        @Suppress("DEPRECATION")
        pm.getApplicationInfo(packageName, 0)
      }
      pm.getApplicationLabel(info).toString().trim().ifEmpty { packageName }
    } catch (error: PackageManager.NameNotFoundException) {
      packageName
    }
    val bounded = truncate(label, MAX_APP_NAME_LENGTH)
    labelCache[packageName] = bounded
    return bounded
  }

  private fun isoUtc(epochMillis: Long): String =
    DateTimeFormatter.ISO_INSTANT.format(Instant.ofEpochMilli(epochMillis).truncatedTo(ChronoUnit.SECONDS))

  private fun fingerprint(packageName: String, title: String, text: String, postTime: Long): String {
    val minuteBucket = postTime / 60_000L
    val digest = MessageDigest.getInstance("SHA-256")
      .digest("$packageName|$title|$text|$minuteBucket".toByteArray(Charsets.UTF_8))
    val hex = StringBuilder(digest.size * 2)
    for (byte in digest) hex.append(String.format("%02x", byte))
    return hex.toString()
  }
}
