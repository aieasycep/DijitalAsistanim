/**
 * Config plugin for the local `notification-listener` Expo module.
 *
 * Android only:
 *  - registers `DaNotificationListenerService` in the app manifest (exported, guarded by
 *    BIND_NOTIFICATION_LISTENER_SERVICE, NotificationListenerService intent filter, default filter
 *    types that exclude ongoing notifications at the system level);
 *  - adds the MAIN/LAUNCHER `<queries>` intent so `getInstalledApps()` can enumerate launchable apps
 *    on Android 11+ package-visibility rules.
 * Idempotent: re-running prebuild updates the existing entries instead of duplicating them.
 */
const { AndroidConfig, createRunOncePlugin, withAndroidManifest } = require('expo/config-plugins');
const pkg = require('./package.json');

const SERVICE_CLASS = 'com.dijitalasistan.notificationlistener.DaNotificationListenerService';
const BIND_PERMISSION = 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE';
const LISTENER_ACTION = 'android.service.notification.NotificationListenerService';
const ACTION_MAIN = 'android.intent.action.MAIN';
const CATEGORY_LAUNCHER = 'android.intent.category.LAUNCHER';

function attributeName(node) {
  return node && node.$ ? node.$['android:name'] : undefined;
}

function ensureListenerService(mainApplication) {
  const services = Array.isArray(mainApplication.service) ? mainApplication.service : [];
  const service = {
    $: {
      'android:name': SERVICE_CLASS,
      'android:exported': 'true',
      'android:permission': BIND_PERMISSION,
      'android:label': '@string/app_name',
    },
    'intent-filter': [{ action: [{ $: { 'android:name': LISTENER_ACTION } }] }],
    'meta-data': [
      {
        $: {
          'android:name': 'android.service.notification.default_filter_types',
          'android:value': 'conversations|alerting|silent',
        },
      },
      {
        $: {
          'android:name': 'android.service.notification.disabled_filter_types',
          'android:value': 'ongoing',
        },
      },
    ],
  };
  const index = services.findIndex((entry) => attributeName(entry) === SERVICE_CLASS);
  if (index >= 0) services[index] = service;
  else services.push(service);
  mainApplication.service = services;
}

function hasLauncherQuery(queries) {
  return queries.some((query) =>
    (Array.isArray(query.intent) ? query.intent : []).some(
      (intent) =>
        (Array.isArray(intent.action) ? intent.action : []).some(
          (action) => attributeName(action) === ACTION_MAIN,
        ) &&
        (Array.isArray(intent.category) ? intent.category : []).some(
          (category) => attributeName(category) === CATEGORY_LAUNCHER,
        ),
    ),
  );
}

function ensureLauncherQuery(manifest) {
  const queries = Array.isArray(manifest.manifest.queries) ? manifest.manifest.queries : [];
  if (!hasLauncherQuery(queries)) {
    queries.push({
      intent: [
        {
          action: [{ $: { 'android:name': ACTION_MAIN } }],
          category: [{ $: { 'android:name': CATEGORY_LAUNCHER } }],
        },
      ],
    });
  }
  manifest.manifest.queries = queries;
}

const withNotificationListener = (config) =>
  withAndroidManifest(config, (mod) => {
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    ensureListenerService(mainApplication);
    ensureLauncherQuery(mod.modResults);
    return mod;
  });

module.exports = createRunOncePlugin(withNotificationListener, pkg.name, pkg.version);
