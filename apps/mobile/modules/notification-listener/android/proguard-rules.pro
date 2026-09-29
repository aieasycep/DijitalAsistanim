# The listener service is referenced from the merged AndroidManifest by class name and instantiated by the system.
-keep class com.dijitalasistan.notificationlistener.DaNotificationListenerService { *; }
# Expo module: expo-modules-core already keeps Module subclasses; keep ours fully so reflection-based argument
# conversion (List<String>) and the event emitter keep working under R8 full mode.
-keep class com.dijitalasistan.notificationlistener.NotificationListenerModule { *; }
-keepclassmembers class com.dijitalasistan.notificationlistener.** { *; }
