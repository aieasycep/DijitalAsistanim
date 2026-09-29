package com.dijitalasistan.notificationlistener

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import java.util.ArrayDeque
import java.util.Locale

private const val TAG = "DaNotificationStore"

/** A notification accepted by the on-device filter. Lives in memory only; it is never written to disk. */
data class CapturedNotification(
  val packageName: String,
  val appName: String,
  val title: String,
  val text: String,
  /** ISO-8601 UTC, second precision. */
  val postedAt: String,
  /** SHA-256 hex of `package|title|text|minuteBucket`. */
  val fingerprint: String,
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "packageName" to packageName,
    "appName" to appName,
    "title" to title,
    "text" to text,
    "postedAt" to postedAt,
    "fingerprint" to fingerprint,
  )
}

/** Mirrors `AndroidNotificationScope` in @da/domain. */
enum class ListenerScope(val wireName: String) {
  ALL_ALLOWED("all_allowed"),
  SELECTED("selected");

  companion object {
    fun fromWire(value: String?): ListenerScope? = values().firstOrNull { it.wireName == value }
  }
}

data class ListenerConfig(
  val enabled: Boolean,
  val scope: ListenerScope,
  /** Lower-cased package names the user explicitly allowed. */
  val allowedPackages: Set<String>,
)

/**
 * Persists ONLY the capture configuration (enabled flag, scope, allow-list) in private SharedPreferences.
 * Notification content is never persisted: accepted items go through [NotificationBus].
 */
object NotificationStore {
  private const val PREFS_NAME = "da_notif_listener"
  private const val KEY_ENABLED = "enabled"
  private const val KEY_SCOPE = "scope"
  private const val KEY_ALLOWED_PACKAGES = "allowed_packages"

  private fun prefs(context: Context): SharedPreferences =
    context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  fun getConfig(context: Context): ListenerConfig {
    val prefs = prefs(context)
    val scope = ListenerScope.fromWire(prefs.getString(KEY_SCOPE, null)) ?: ListenerScope.ALL_ALLOWED
    val allowed = prefs.getStringSet(KEY_ALLOWED_PACKAGES, null)
      ?.map { it.lowercase(Locale.ROOT) }
      ?.toSet()
      ?: emptySet()
    return ListenerConfig(
      enabled = prefs.getBoolean(KEY_ENABLED, false),
      scope = scope,
      allowedPackages = allowed,
    )
  }

  fun setEnabled(context: Context, enabled: Boolean) {
    prefs(context).edit().putBoolean(KEY_ENABLED, enabled).apply()
  }

  fun setScope(context: Context, scope: ListenerScope) {
    prefs(context).edit().putString(KEY_SCOPE, scope.wireName).apply()
  }

  fun setAllowedPackages(context: Context, packages: Collection<String>) {
    // SharedPreferences requires a fresh set instance; normalise while copying.
    val normalised = HashSet<String>()
    for (raw in packages) {
      val value = raw.trim().lowercase(Locale.ROOT)
      if (value.isNotEmpty()) normalised.add(value)
    }
    prefs(context).edit().putStringSet(KEY_ALLOWED_PACKAGES, normalised).apply()
  }
}

/**
 * In-process hand-off between the listener service and the Expo module. While no JS listener is attached
 * (app killed, React host not started yet) items wait in a bounded in-memory queue; the queue is flushed
 * the moment the module starts observing `notificationPosted`. Nothing here touches the filesystem.
 */
object NotificationBus {
  private const val MAX_QUEUED = 200

  private val lock = Any()
  private val queue = ArrayDeque<CapturedNotification>()
  private var sink: ((CapturedNotification) -> Unit)? = null

  fun attach(listener: (CapturedNotification) -> Unit) {
    val backlog: List<CapturedNotification>
    synchronized(lock) {
      sink = listener
      backlog = queue.toList()
      queue.clear()
    }
    for (item in backlog) deliver(listener, item)
  }

  fun detach() {
    synchronized(lock) { sink = null }
  }

  fun publish(item: CapturedNotification) {
    val target: ((CapturedNotification) -> Unit)?
    synchronized(lock) {
      target = sink
      if (target == null) {
        while (queue.size >= MAX_QUEUED) queue.pollFirst()
        queue.addLast(item)
      }
    }
    if (target != null) deliver(target, item)
  }

  fun clear() {
    synchronized(lock) { queue.clear() }
  }

  fun queuedCount(): Int = synchronized(lock) { queue.size }

  private fun deliver(listener: (CapturedNotification) -> Unit, item: CapturedNotification) {
    try {
      listener(item)
    } catch (error: Throwable) {
      // Never let a JS-side failure crash the listener service.
      Log.w(TAG, "Dropping notification event: ${error.javaClass.simpleName}")
    }
  }
}
