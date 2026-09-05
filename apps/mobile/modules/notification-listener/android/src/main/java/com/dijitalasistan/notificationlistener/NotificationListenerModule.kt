package com.dijitalasistan.notificationlistener

import android.app.NotificationManager
import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import android.util.Log
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Locale

private const val TAG = "DaNotificationListener"
internal const val EVENT_NOTIFICATION_POSTED = "notificationPosted"

class InvalidScopeException(scope: String) :
  CodedException("Unknown notification scope '$scope' (expected 'all_allowed' or 'selected')")

/**
 * Expo module `NotificationListener`.
 *
 * Functions: isPermissionGranted, isStarted, openPermissionSettings, getInstalledApps, setAllowedPackages,
 * setScope, start, stop. Event: `notificationPosted` { packageName, appName, title, text, postedAt, fingerprint }.
 */
class NotificationListenerModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React application context is not available" }

  override fun definition() = ModuleDefinition {
    Name("NotificationListener")

    Events(EVENT_NOTIFICATION_POSTED)

    Function("isPermissionGranted") { isPermissionGranted(context) }

    Function("isStarted") { NotificationStore.getConfig(context).enabled }

    AsyncFunction("openPermissionSettings") { openPermissionSettings() }

    AsyncFunction("getInstalledApps") { installedApps() }

    AsyncFunction("setAllowedPackages") { packages: List<String> ->
      NotificationStore.setAllowedPackages(context, packages)
    }

    AsyncFunction("setScope") { scope: String ->
      val parsed = ListenerScope.fromWire(scope) ?: throw InvalidScopeException(scope)
      NotificationStore.setScope(context, parsed)
    }

    AsyncFunction("start") {
      NotificationStore.setEnabled(context, true)
      isPermissionGranted(context)
    }

    AsyncFunction("stop") {
      NotificationStore.setEnabled(context, false)
      NotificationBus.clear()
    }

    OnStartObserving(EVENT_NOTIFICATION_POSTED) {
      NotificationBus.attach { item -> emit(item) }
    }

    OnStopObserving(EVENT_NOTIFICATION_POSTED) {
      NotificationBus.detach()
    }

    OnDestroy {
      NotificationBus.detach()
    }
  }

  private fun emit(item: CapturedNotification) {
    try {
      sendEvent(EVENT_NOTIFICATION_POSTED, item.toMap())
    } catch (error: Throwable) {
      // The React context can be torn down between attach and delivery; the item is simply dropped.
      Log.w(TAG, "Could not deliver notification event: ${error.javaClass.simpleName}")
    }
  }

  private fun listenerComponent(context: Context): ComponentName =
    ComponentName(context, DaNotificationListenerService::class.java)

  private fun isPermissionGranted(context: Context): Boolean {
    val component = listenerComponent(context)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
      if (manager != null) return manager.isNotificationListenerAccessGranted(component)
    }
    val flat = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners") ?: return false
    return flat.split(':').any { ComponentName.unflattenFromString(it) == component }
  }

  private fun openPermissionSettings(): Boolean {
    val ctx = context
    val component = listenerComponent(ctx)
    val candidates = ArrayList<Intent>(3)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      candidates.add(
        Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS)
          .putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME, component.flattenToString()),
      )
    }
    candidates.add(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
    candidates.add(Intent(Settings.ACTION_SETTINGS))

    for (intent in candidates) {
      try {
        val activity = appContext.currentActivity
        if (activity != null) {
          activity.startActivity(intent)
        } else {
          ctx.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
        return true
      } catch (error: ActivityNotFoundException) {
        Log.w(TAG, "Settings screen unavailable: ${intent.action}")
      }
    }
    return false
  }

  private fun installedApps(): List<Map<String, Any?>> {
    val ctx = context
    val pm = ctx.packageManager
    val launcherIntent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
    val resolved = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      pm.queryIntentActivities(launcherIntent, PackageManager.ResolveInfoFlags.of(0L))
    } else {
      @Suppress("DEPRECATION")
      pm.queryIntentActivities(launcherIntent, 0)
    }

    val labels = LinkedHashMap<String, String>()
    for (info in resolved) {
      val packageName = info.activityInfo?.packageName ?: continue
      if (packageName == ctx.packageName || labels.containsKey(packageName)) continue
      val label = info.loadLabel(pm).toString().trim().ifEmpty { packageName }
      labels[packageName] = label.take(120)
    }

    return labels.entries
      .sortedBy { it.value.lowercase(Locale.ROOT) }
      .map { (packageName, label) ->
        mapOf(
          "packageName" to packageName,
          "appName" to label,
          "isDefaultExcluded" to NotificationFilter.isDefaultExcluded(packageName),
          "isMessaging" to NotificationFilter.isMessaging(packageName),
        )
      }
  }
}
