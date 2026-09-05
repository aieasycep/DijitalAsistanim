import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Dijital Asistan — Expo app configuration.
 * Everything identity-related is overridable via env so the same config serves dev / preview / production.
 * Native features requiring config plugins: notifications, calendar, contacts, image/document pickers,
 * share extension (expo-share-intent), widgets (expo-widgets), Apple Sign in, background tasks,
 * Android NotificationListenerService (local module ./modules/notification-listener).
 */
const env = (key: string, fallback: string): string => process.env[key] && process.env[key] !== '' ? String(process.env[key]) : fallback;

const APP_NAME = env('APP_NAME', 'Dijital Asistan');
const SCHEME = env('APP_SCHEME', env('EXPO_PUBLIC_APP_SCHEME', 'dijitalasistan'));
const IOS_BUNDLE_ID = env('IOS_BUNDLE_ID', 'com.dijitalasistan.app');
const ANDROID_PACKAGE = env('ANDROID_PACKAGE', 'com.dijitalasistan.app');
const APP_GROUP = env('IOS_APP_GROUP', `group.${IOS_BUNDLE_ID}`);
const APPLE_TEAM_ID = env('APPLE_TEAM_ID', '');
const EAS_PROJECT_ID = env('EXPO_PUBLIC_EAS_PROJECT_ID', '');
const UNIVERSAL_HOSTS = env('EXPO_PUBLIC_UNIVERSAL_LINK_HOSTS', 'dijitalasistan.app,www.dijitalasistan.app')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean);
const IS_PRODUCTION = process.env.APP_ENV === 'production' || process.env.EAS_BUILD_PROFILE === 'production';
const VERSION = env('APP_VERSION', '1.0.0');

const config = (_ctx: ConfigContext): ExpoConfig => ({
  name: APP_NAME,
  slug: 'dijital-asistan',
  version: VERSION,
  orientation: 'portrait',
  scheme: SCHEME,
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  primaryColor: '#5B5CE2',
  backgroundColor: '#F5F4F0',
  assetBundlePatterns: ['**/*'],
  locales: {
    tr: './assets/locales/tr.json',
    en: './assets/locales/en.json',
  },
  ios: {
    bundleIdentifier: IOS_BUNDLE_ID,
    supportsTablet: false,
    buildNumber: env('IOS_BUILD_NUMBER', '1'),
    usesAppleSignIn: true,
    associatedDomains: UNIVERSAL_HOSTS.map((h) => `applinks:${h}`),
    entitlements: {
      'com.apple.security.application-groups': [APP_GROUP],
      'aps-environment': IS_PRODUCTION ? 'production' : 'development',
    },
    infoPlist: {
      CFBundleDisplayName: APP_NAME,
      CFBundleLocalizations: ['tr', 'en'],
      CFBundleDevelopmentRegion: 'tr',
      NSCalendarsFullAccessUsageDescription:
        'Takvimini okuyarak gününü, çakışmaları ve toplantı hazırlıklarını anlayabiliriz. Etkinlikler yalnızca sen onaylayınca oluşturulur.',
      NSCalendarsWriteOnlyAccessUsageDescription: 'Onayladığın etkinlikleri takvimine ekleyebilmek için.',
      NSRemindersFullAccessUsageDescription: 'Onayladığın hatırlatıcıları Anımsatıcılar uygulamasına ekleyebilmek için.',
      NSContactsUsageDescription: 'Önemli kişileri (VIP) rehberinden seçebilmen için. İsteğe bağlıdır.',
      NSMicrophoneUsageDescription: 'Sesli soru sorabilmen ve toplantı sonrası not alabilmen için.',
      NSSpeechRecognitionUsageDescription: 'Sesli sorularını cihaz üzerinde yazıya dökmek için.',
      NSCameraUsageDescription: 'Belge, ekran görüntüsü veya etkinlik afişini yakalayıp analiz edebilmek için.',
      NSPhotoLibraryUsageDescription: 'Ekran görüntüsü veya fotoğrafları yakalayıp analiz edebilmek için.',
      NSFaceIDUsageDescription: 'Hesabına hızlı ve güvenli erişim için.',
      NSUserActivityTypes: [`${IOS_BUNDLE_ID}.open`],
      ITSAppUsesNonExemptEncryption: false,
      UIBackgroundModes: ['audio', 'fetch', 'remote-notification', 'processing'],
      BGTaskSchedulerPermittedIdentifiers: [`${IOS_BUNDLE_ID}.sync`, `${IOS_BUNDLE_ID}.widget-refresh`],
      LSApplicationQueriesSchemes: ['googlegmail', 'ms-outlook', 'msteams', 'zoomus', 'comgooglemaps', 'maps', 'whatsapp', 'googlemeet'],
    },
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyCollectedDataTypes: [
        { NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeEmailAddress', NSPrivacyCollectedDataTypeLinked: true, NSPrivacyCollectedDataTypeTracking: false, NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'] },
        { NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeEmailsOrTextMessages', NSPrivacyCollectedDataTypeLinked: true, NSPrivacyCollectedDataTypeTracking: false, NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'] },
        { NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeCrashData', NSPrivacyCollectedDataTypeLinked: false, NSPrivacyCollectedDataTypeTracking: false, NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'] },
        { NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeProductInteraction', NSPrivacyCollectedDataTypeLinked: false, NSPrivacyCollectedDataTypeTracking: false, NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAnalytics'] },
      ],
      NSPrivacyAccessedAPITypes: [
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults', NSPrivacyAccessedAPITypeReasons: ['CA92.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp', NSPrivacyAccessedAPITypeReasons: ['C617.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime', NSPrivacyAccessedAPITypeReasons: ['35F9.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace', NSPrivacyAccessedAPITypeReasons: ['E174.1'] },
      ],
    },
    config: { usesNonExemptEncryption: false },
  },
  android: {
    package: ANDROID_PACKAGE,
    versionCode: Number(env('ANDROID_VERSION_CODE', '1')),
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      monochromeImage: './assets/adaptive-icon-mono.png',
      backgroundColor: '#5B5CE2',
    },
    allowBackup: false,
    softwareKeyboardLayoutMode: 'pan',
    permissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.READ_CALENDAR',
      'android.permission.WRITE_CALENDAR',
      'android.permission.READ_CONTACTS',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'android.permission.VIBRATE',
      'android.permission.CAMERA',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.SCHEDULE_EXACT_ALARM',
    ],
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: UNIVERSAL_HOSTS.map((host) => ({ scheme: 'https', host, pathPrefix: '/app' })),
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  web: { bundler: 'metro', output: 'single', favicon: './assets/favicon.png' },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-secure-store',
    'expo-localization',
    'expo-web-browser',
    'expo-apple-authentication',
    'expo-audio',
    'expo-background-task',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 160,
        resizeMode: 'contain',
        backgroundColor: '#F5F4F0',
        dark: { image: './assets/splash-icon-dark.png', backgroundColor: '#141311' },
      },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/notification-icon.png',
        color: '#5B5CE2',
        defaultChannel: 'general',
        sounds: [],
        enableBackgroundRemoteNotifications: true,
      },
    ],
    [
      'expo-calendar',
      {
        calendarPermission: 'Takvimini okuyarak gününü ve çakışmaları anlayabiliriz.',
        remindersPermission: 'Onayladığın hatırlatıcıları Anımsatıcılar uygulamasına ekleyebilmek için.',
      },
    ],
    ['expo-contacts', { contactsPermission: 'Önemli kişileri rehberinden seçebilmen için. İsteğe bağlıdır.' }],
    [
      'expo-image-picker',
      {
        photosPermission: 'Ekran görüntüsü veya fotoğrafları yakalayıp analiz edebilmek için.',
        cameraPermission: 'Belge veya afişleri yakalayıp analiz edebilmek için.',
        microphonePermission: false,
      },
    ],
    ['expo-document-picker', { iCloudContainerEnvironment: IS_PRODUCTION ? 'Production' : 'Development' }],
    [
      'expo-share-intent',
      {
        iosActivationRules: {
          NSExtensionActivationSupportsText: true,
          NSExtensionActivationSupportsWebURLWithMaxCount: 1,
          NSExtensionActivationSupportsWebPageWithMaxCount: 1,
          NSExtensionActivationSupportsImageWithMaxCount: 5,
          NSExtensionActivationSupportsFileWithMaxCount: 3,
        },
        iosShareExtensionName: `${APP_NAME} · Ekle`,
        iosAppGroupIdentifier: APP_GROUP,
        androidIntentFilters: ['text/*', 'image/*', 'application/pdf', '*/*'],
        androidMultiIntentFilters: ['image/*', 'application/pdf'],
      },
    ],
    [
      'expo-widgets',
      {
        enableAndroid: true,
        appGroupIdentifier: APP_GROUP,
        widgets: [
          {
            name: 'NextImportant',
            displayName: 'Sıradaki',
            description: 'Bugün bilmen gereken bir sonraki şey.',
            supportedFamilies: ['systemSmall', 'accessoryRectangular', 'accessoryInline', 'accessoryCircular'],
            contentMarginsDisabled: false,
            android: { targetCellWidth: 2, targetCellHeight: 2, resizeMode: 'horizontal' },
          },
          {
            name: 'TodayPriorities',
            displayName: 'Bugün',
            description: 'Günün 3 önceliği.',
            supportedFamilies: ['systemMedium'],
            contentMarginsDisabled: false,
            android: { targetCellWidth: 4, targetCellHeight: 2, resizeMode: 'horizontal' },
          },
          {
            name: 'DailyBrief',
            displayName: 'Brifing',
            description: 'Brifing, sıradaki etkinlik ve açık takipler.',
            supportedFamilies: ['systemLarge'],
            contentMarginsDisabled: false,
            android: { targetCellWidth: 4, targetCellHeight: 4, resizeMode: 'both' },
          },
        ],
      },
    ],
    [
      'expo-build-properties',
      {
        ios: { deploymentTarget: '16.4', useFrameworks: 'static' },
        android: { compileSdkVersion: 36, targetSdkVersion: 36, minSdkVersion: 26 },
      },
    ],
    [
      '@sentry/react-native/expo',
      {
        organization: env('SENTRY_ORG', 'dijital-asistan'),
        project: env('SENTRY_PROJECT', 'mobile'),
        url: 'https://sentry.io/',
      },
    ],
    './modules/notification-listener/app.plugin.js',
    './plugins/withAndroidNotificationChannels.js',
    './plugins/withAppleTeamId.js',
  ],
  experiments: { typedRoutes: true, reactCompiler: true },
  extra: {
    eas: EAS_PROJECT_ID ? { projectId: EAS_PROJECT_ID } : undefined,
    appGroup: APP_GROUP,
    appleTeamId: APPLE_TEAM_ID,
    universalHosts: UNIVERSAL_HOSTS,
    isProduction: IS_PRODUCTION,
  },
  updates: { enabled: false },
  runtimeVersion: { policy: 'appVersion' },
  owner: env('EXPO_OWNER', undefined as unknown as string) || undefined,
});

export default config;
