import type { DataSource } from '@da/api-client';
import type { UserPreferences } from '@da/domain';
import type { CapturedNotification, InstalledApp } from '../../../modules/notification-listener';
import {
  FingerprintMemory,
  chunk,
  dedupeByFingerprint,
  filterNotification,
  foldText,
  isDefaultExcludedPackage,
  isMessagingPackage,
  isPackageAllowed,
  isSensitiveNotification,
} from '../androidNotificationFilter';
import {
  AndroidNotificationsService,
  type AndroidNotificationPreferences,
  type FingerprintStore,
  type NotificationListenerPort,
} from '../androidNotifications';

jest.mock('../../lib/storage', () => ({
  CacheKeys: { preferences: 'cache.preferences.v1' },
  readCache: jest.fn(() => null),
  writeCache: jest.fn(),
}));

jest.mock('../../lib/monitoring', () => ({
  captureError: jest.fn(),
}));

jest.mock('../../../modules/notification-listener', () => ({
  isSupported: () => false,
  isPermissionGranted: () => false,
  openPermissionSettings: async () => ({ supported: false }),
  getInstalledApps: async () => ({ supported: false }),
  setAllowedPackages: async () => ({ supported: false }),
  setScope: async () => ({ supported: false }),
  start: async () => ({ supported: false }),
  stop: async () => ({ supported: false }),
  addNotificationListener: () => ({ remove: () => undefined }),
}));

// ---------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------

const ALL_ALLOWED = { scope: 'all_allowed', allowedPackages: [] } as const;

function notification(overrides: Partial<CapturedNotification> = {}): CapturedNotification {
  const seed = overrides.fingerprint ?? overrides.title ?? 'seed';
  return {
    packageName: 'com.hepsiburada.ecommerce',
    appName: 'Hepsiburada',
    title: 'Siparişin yola çıktı',
    text: 'Kargon bugün teslim edilecek.',
    postedAt: '2026-09-05T08:15:00Z',
    fingerprint: `${'f'.repeat(48)}${seed.padStart(16, '0').slice(-16)}`,
    ...overrides,
  };
}

interface FakeListener {
  port: NotificationListenerPort;
  state: { scope: string; allowedPackages: string[]; started: boolean; settingsOpened: number };
  emit: (item: CapturedNotification) => void;
}

function createFakeListener(supported = true): FakeListener {
  const listeners = new Set<(item: CapturedNotification) => void>();
  const state = {
    scope: 'all_allowed',
    allowedPackages: [] as string[],
    started: false,
    settingsOpened: 0,
  };
  const apps: InstalledApp[] = [
    {
      packageName: 'com.whatsapp',
      appName: 'WhatsApp',
      isDefaultExcluded: false,
      isMessaging: true,
    },
    {
      packageName: 'com.x8bit.bitwarden',
      appName: 'Bitwarden',
      isDefaultExcluded: true,
      isMessaging: false,
    },
  ];
  const port: NotificationListenerPort = {
    isSupported: () => supported,
    isPermissionGranted: () => supported,
    openPermissionSettings: async () => {
      state.settingsOpened += 1;
      return { supported: true, opened: true };
    },
    getInstalledApps: async () => ({ supported: true, apps }),
    setAllowedPackages: async (packages) => {
      state.allowedPackages = [...packages];
      return { supported: true };
    },
    setScope: async (scope) => {
      state.scope = scope;
      return { supported: true };
    },
    start: async () => {
      state.started = true;
      return { supported: true, permissionGranted: true };
    },
    stop: async () => {
      state.started = false;
      return { supported: true };
    },
    addNotificationListener: (listener) => {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
  };
  return { port, state, emit: (item) => listeners.forEach((listener) => listener(item)) };
}

function createMemoryStore(): FingerprintStore & { snapshot: string[] } {
  const store = {
    snapshot: [] as string[],
    read: () => store.snapshot,
    write: (fps: readonly string[]) => {
      store.snapshot = [...fps];
    },
  };
  return store;
}

function preferences(overrides: Partial<AndroidNotificationPreferences> = {}): UserPreferences {
  return {
    userId: 'u1',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    theme: 'system',
    locale: 'tr',
    timezone: 'Europe/Istanbul',
    briefing: {
      morningTime: '07:30',
      middayEnabled: true,
      middayTime: '13:00',
      eveningEnabled: true,
      eveningTime: '19:00',
      weeklyEnabled: true,
      weeklyDay: 0,
      weeklyTime: '18:00',
      weekendEnabled: false,
      quietDays: [],
    },
    interests: [],
    learnFromInteractions: true,
    defaultReminderLeadMinutes: 30,
    retention: '90d',
    analyzeAttachments: false,
    reducedMotion: false,
    hapticsEnabled: true,
    androidNotificationScope: 'all_allowed',
    androidAllowedPackages: [],
    androidNotificationUploadConsent: false,
    ...overrides,
  } as UserPreferences;
}

function createFakeDataSource(
  prefs: UserPreferences,
  ingest = jest.fn(async (items: unknown[]) => ({ accepted: (items as unknown[]).length })),
) {
  const ds = {
    profile: { getPreferences: jest.fn(async () => prefs) },
    androidNotifications: {
      ingest,
      listRecent: jest.fn(async () => []),
      clearAll: jest.fn(async () => undefined),
    },
  };
  return { ds: ds as unknown as DataSource, ingest };
}

function createService(options: { supported?: boolean; listener?: FakeListener } = {}) {
  const listener = options.listener ?? createFakeListener(options.supported ?? true);
  const store = createMemoryStore();
  const reportError = jest.fn();
  const service = new AndroidNotificationsService({
    listener: listener.port,
    fingerprintStore: store,
    reportError,
    delay: async () => undefined,
    flushDebounceMs: 0,
  });
  return { service, listener, store, reportError };
}

// ---------------------------------------------------------------------------------------------------
// Pure filter
// ---------------------------------------------------------------------------------------------------

describe('androidNotificationFilter · packages', () => {
  it('never allows authenticator, password manager, banking or OTP-autofill packages', () => {
    for (const pkg of [
      'com.google.android.apps.authenticator2',
      'com.azure.authenticator',
      'com.authy.authy',
      'com.x8bit.bitwarden',
      'com.lastpass.lpandroid',
      'com.onepassword.android',
      'com.dashlane',
      'com.callpod.android_apps.keeper',
      'com.google.android.gms',
      'com.garanti.cepsubesi',
      'com.ykb.android',
    ]) {
      expect(isDefaultExcludedPackage(pkg)).toBe(true);
      expect(
        isSensitiveNotification({ packageName: pkg, title: 'Merhaba', text: 'Günaydın' }),
      ).toEqual({
        sensitive: true,
        reason: 'excluded_package',
      });
      expect(isPackageAllowed(pkg, { scope: 'selected', allowedPackages: [pkg] })).toBe(false);
    }
  });

  it('excludes unknown packages whose name looks like a vault / OTP / bank app', () => {
    expect(isDefaultExcludedPackage('com.example.passwordvault')).toBe(true);
    expect(isDefaultExcludedPackage('io.acme.totp')).toBe(true);
    expect(isDefaultExcludedPackage('com.newbank.mobile')).toBe(true);
    expect(isDefaultExcludedPackage('com.hepsiburada.ecommerce')).toBe(false);
  });

  it('treats messaging apps as opt-in only', () => {
    expect(isMessagingPackage('com.whatsapp')).toBe(true);
    expect(isMessagingPackage('com.Slack')).toBe(true);
    expect(isPackageAllowed('com.whatsapp', ALL_ALLOWED)).toBe(false);
    expect(
      isPackageAllowed('com.whatsapp', { scope: 'all_allowed', allowedPackages: ['com.whatsapp'] }),
    ).toBe(true);
    expect(isPackageAllowed('com.hepsiburada.ecommerce', ALL_ALLOWED)).toBe(true);
  });

  it('honours the "selected" scope', () => {
    const selected = { scope: 'selected', allowedPackages: ['com.trendyol.app'] } as const;
    expect(isPackageAllowed('com.trendyol.app', selected)).toBe(true);
    expect(isPackageAllowed('COM.TRENDYOL.APP ', selected)).toBe(true);
    expect(isPackageAllowed('com.hepsiburada.ecommerce', selected)).toBe(false);
  });
});

describe('androidNotificationFilter · content', () => {
  it('folds Turkish letters consistently with the Kotlin filter', () => {
    expect(foldText('DOĞRULAMA KODUNUZ ŞİFRENİZ Iı')).toBe('dogrulama kodunuz sifreniz ii');
  });

  it.each([
    ['Doğrulama kodunuz: 482913', 'otp'],
    ['Giriş kodun 4829. Kimseyle paylaşma.', 'otp'],
    ['Your verification code is 123-456', 'otp'],
    ['G-123456 is your Google verification code.', 'otp'],
    ['OTP 77421 ile işlemi onaylayın', 'otp'],
    ['PIN: 2048', 'otp'],
    ['Tek kullanımlık şifreniz 90210', 'credential'],
    ['Şifreniz: Yaz2026!', 'credential'],
  ])('flags "%s" as %s', (text, reason) => {
    const result = isSensitiveNotification({
      packageName: 'com.google.android.apps.messaging',
      title: '',
      text,
    });
    expect(result).toEqual({ sensitive: true, reason });
  });

  it.each([
    'Siparişin kargoya verildi. Takip no: 1234567890123',
    'Toplantı 14:30’da başlıyor, 2 hazırlık notun var.',
    'Faturanız 1.250 TL — son ödeme 12 Eylül',
    'Uçuşun yarın 08:45, check-in açık',
  ])('accepts ordinary content: "%s"', (text) => {
    expect(
      isSensitiveNotification({ packageName: 'com.hepsiburada.ecommerce', title: 'Bilgi', text }),
    ).toEqual({
      sensitive: false,
      reason: null,
    });
  });

  it('keeps OTP filtering even for explicitly allowed messaging apps', () => {
    const config = {
      scope: 'all_allowed',
      allowedPackages: ['com.google.android.apps.messaging'],
    } as const;
    expect(
      filterNotification(
        {
          packageName: 'com.google.android.apps.messaging',
          title: 'Banka',
          text: 'Onay kodu 553201',
        },
        config,
      ),
    ).toEqual({ accepted: false, reason: 'otp' });
    expect(
      filterNotification(
        {
          packageName: 'com.google.android.apps.messaging',
          title: 'Ayşe',
          text: 'Yarın 10’da görüşelim mi?',
        },
        config,
      ),
    ).toEqual({ accepted: true });
    expect(
      filterNotification({ packageName: 'com.whatsapp', title: 'Ali', text: 'Selam' }, ALL_ALLOWED),
    ).toEqual({
      accepted: false,
      reason: 'not_allowed',
    });
  });
});

describe('androidNotificationFilter · batching helpers', () => {
  it('dedupes against seen fingerprints and within the batch', () => {
    const seen = new Set(['a']);
    const items = [
      { fingerprint: 'a' },
      { fingerprint: 'b' },
      { fingerprint: 'b' },
      { fingerprint: 'c' },
    ];
    expect(dedupeByFingerprint(items, seen).map((i) => i.fingerprint)).toEqual(['b', 'c']);
  });

  it('chunks into ingest-sized batches', () => {
    const items = Array.from({ length: 250 }, (_, i) => i);
    const parts = chunk(items, 100);
    expect(parts.map((p) => p.length)).toEqual([100, 100, 50]);
    expect(chunk([], 100)).toEqual([]);
    expect(chunk([1, 2, 3], 0).map((p) => p.length)).toEqual([1, 1, 1]);
  });

  it('bounds the fingerprint memory and evicts the oldest first', () => {
    const memory = new FingerprintMemory(['x'], 3);
    expect(memory.add('x')).toBe(false);
    expect(memory.add('y')).toBe(true);
    expect(memory.add('z')).toBe(true);
    expect(memory.add('w')).toBe(true);
    expect(memory.size).toBe(3);
    expect(memory.has('x')).toBe(false);
    expect(memory.toArray()).toEqual(['y', 'z', 'w']);
  });
});

// ---------------------------------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------------------------------

describe('AndroidNotificationsService', () => {
  it('is a no-op when the platform is unsupported', async () => {
    const { service, listener } = createService({ supported: false });
    const { ds, ingest } = createFakeDataSource(
      preferences({ androidNotificationUploadConsent: true }),
    );
    await service.initialize(ds);
    expect(service.isSupported).toBe(false);
    expect(service.handleIncoming(notification())).toBe('unsupported');
    expect(await service.flush()).toEqual({ uploaded: 0, rejected: 0, failed: 0 });
    expect(await service.installedApps()).toEqual([]);
    expect(await service.openSettings()).toBe(false);
    expect(listener.state.started).toBe(false);
    expect(ingest).not.toHaveBeenCalled();
  });

  it('pushes scope and allow-list to the native filter and starts capture', async () => {
    const { service, listener } = createService();
    const { ds } = createFakeDataSource(
      preferences({
        androidNotificationScope: 'selected',
        androidAllowedPackages: [' com.whatsapp ', 'com.whatsapp', 'com.trendyol.app'],
      }),
    );
    await service.initialize(ds);
    expect(listener.state.started).toBe(true);
    expect(listener.state.scope).toBe('selected');
    expect(listener.state.allowedPackages).toEqual(['com.whatsapp', 'com.trendyol.app']);
    expect(service.filter).toEqual({
      scope: 'selected',
      allowedPackages: ['com.whatsapp', 'com.trendyol.app'],
    });
    expect(service.isPermissionGranted()).toBe(true);
    expect(await service.openSettings()).toBe(true);
    expect(listener.state.settingsOpened).toBe(1);
    expect((await service.installedApps()).map((a) => a.packageName)).toEqual([
      'com.whatsapp',
      'com.x8bit.bitwarden',
    ]);
  });

  it('keeps items on device and never uploads without consent', async () => {
    const { service, listener } = createService();
    const { ds, ingest } = createFakeDataSource(
      preferences({ androidNotificationUploadConsent: false }),
    );
    await service.initialize(ds);
    listener.emit(notification({ title: 'Kargon yola çıktı' }));
    listener.emit(notification({ title: 'Kargon yola çıktı' }));
    expect(service.listLocal()).toHaveLength(1);
    expect(service.listLocal()[0]?.title).toBe('Kargon yola çıktı');
    expect(await service.flush()).toEqual({ uploaded: 0, rejected: 0, failed: 0 });
    expect(ingest).not.toHaveBeenCalled();
    service.clearLocal();
    expect(service.listLocal()).toHaveLength(0);
  });

  it('uploads accepted items only, once, when consent is on', async () => {
    const { service, listener, store } = createService();
    const { ds, ingest } = createFakeDataSource(
      preferences({ androidNotificationUploadConsent: true }),
    );
    await service.initialize(ds);

    const shipment = notification({ title: 'Kargon yola çıktı' });
    expect(service.handleIncoming(shipment)).toBe('queued');
    expect(service.handleIncoming(shipment)).toBe('duplicate');
    expect(
      service.handleIncoming(
        notification({ packageName: 'com.google.android.apps.authenticator2', title: 'Kod' }),
      ),
    ).toBe('rejected');
    expect(
      service.handleIncoming(
        notification({ title: 'Doğrulama kodunuz 482913', fingerprint: 'otp'.padEnd(64, '1') }),
      ),
    ).toBe('rejected');
    expect(
      service.handleIncoming(
        notification({
          packageName: 'com.whatsapp',
          title: 'Ali',
          fingerprint: 'wa'.padEnd(64, '2'),
        }),
      ),
    ).toBe('rejected');
    listener.emit(notification({ title: 'Faturan hazır', fingerprint: 'bill'.padEnd(64, '3') }));

    const result = await service.flush();
    expect(result).toEqual({ uploaded: 2, rejected: 0, failed: 0 });
    expect(ingest).toHaveBeenCalledTimes(1);
    const uploaded = ingest.mock.calls[0]?.[0] as CapturedNotification[];
    expect(uploaded.map((i) => i.title)).toEqual(['Kargon yola çıktı', 'Faturan hazır']);
    expect(uploaded.every((i) => !/kod/i.test(i.title))).toBe(true);
    expect(store.snapshot).toHaveLength(2);
    expect(service.listLocal()).toHaveLength(0);
    expect(service.pendingUploadCount).toBe(0);

    // A re-delivered notification (same fingerprint) is never uploaded twice.
    expect(service.handleIncoming(shipment)).toBe('duplicate');
    expect(await service.flush()).toEqual({ uploaded: 0, rejected: 0, failed: 0 });
    expect(ingest).toHaveBeenCalledTimes(1);
  });

  it('splits uploads into batches of at most 100 items', async () => {
    const { service } = createService();
    const { ds, ingest } = createFakeDataSource(
      preferences({ androidNotificationUploadConsent: true }),
    );
    await service.initialize(ds);
    for (let i = 0; i < 150; i += 1) {
      service.handleIncoming(
        notification({ title: `Bildirim ${i}`, fingerprint: String(i).padStart(64, '0') }),
      );
    }
    expect(await service.flush()).toEqual({ uploaded: 150, rejected: 0, failed: 0 });
    expect(ingest).toHaveBeenCalledTimes(2);
    expect((ingest.mock.calls[0]?.[0] as unknown[]).length).toBe(100);
    expect((ingest.mock.calls[1]?.[0] as unknown[]).length).toBe(50);
  });

  it('retries once, then requeues failed items for the next flush', async () => {
    const { service, reportError } = createService();
    const ingest = jest
      .fn<Promise<{ accepted: number }>, [unknown[]]>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ accepted: 1 });
    const { ds } = createFakeDataSource(
      preferences({ androidNotificationUploadConsent: true }),
      ingest,
    );
    await service.initialize(ds);
    service.handleIncoming(notification({ title: 'Toplantı hatırlatması' }));

    expect(await service.flush()).toEqual({ uploaded: 0, rejected: 0, failed: 1 });
    expect(ingest).toHaveBeenCalledTimes(2);
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(service.pendingUploadCount).toBe(1);

    expect(await service.flush()).toEqual({ uploaded: 1, rejected: 0, failed: 0 });
    expect(ingest).toHaveBeenCalledTimes(3);
    expect(service.pendingUploadCount).toBe(0);
  });

  it('drops the upload queue when consent is withdrawn and re-checks the allow-list before upload', async () => {
    const { service, listener } = createService();
    const { ds, ingest } = createFakeDataSource(
      preferences({ androidNotificationUploadConsent: true }),
    );
    await service.initialize(ds);
    service.handleIncoming(
      notification({
        packageName: 'com.whatsapp',
        title: 'Ali',
        fingerprint: 'wa'.padEnd(64, '4'),
      }),
    );
    expect(service.pendingUploadCount).toBe(0);

    await service.applyPreferences(
      preferences({
        androidNotificationUploadConsent: true,
        androidAllowedPackages: ['com.whatsapp'],
      }),
    );
    expect(
      service.handleIncoming(
        notification({
          packageName: 'com.whatsapp',
          title: 'Ayşe',
          fingerprint: 'wa'.padEnd(64, '5'),
        }),
      ),
    ).toBe('queued');
    // Allow-list narrowed again before the flush ran → the queued WhatsApp item must not be uploaded.
    await service.applyPreferences(
      preferences({ androidNotificationUploadConsent: true, androidAllowedPackages: [] }),
    );
    expect(await service.flush()).toEqual({ uploaded: 0, rejected: 1, failed: 0 });
    expect(ingest).not.toHaveBeenCalled();

    service.handleIncoming(
      notification({ title: 'Kargon geldi', fingerprint: 'ok'.padEnd(64, '6') }),
    );
    expect(service.pendingUploadCount).toBe(1);
    await service.applyPreferences(preferences({ androidNotificationUploadConsent: false }));
    expect(service.pendingUploadCount).toBe(0);
    expect(await service.flush()).toEqual({ uploaded: 0, rejected: 0, failed: 0 });
    expect(ingest).not.toHaveBeenCalled();
    expect(listener.state.allowedPackages).toEqual([]);
  });

  it('falls back to defaults when preferences cannot be loaded and resets cleanly on sign-out', async () => {
    const { service, listener, store } = createService();
    const ds = {
      profile: {
        getPreferences: jest.fn(async () => {
          throw new Error('offline');
        }),
      },
      androidNotifications: { ingest: jest.fn(), listRecent: jest.fn(), clearAll: jest.fn() },
    } as unknown as DataSource;
    await service.initialize(ds);
    expect(service.filter).toEqual({ scope: 'all_allowed', allowedPackages: [] });
    expect(service.uploadConsentGranted).toBe(false);
    listener.emit(notification({ title: 'Kargon yola çıktı' }));
    expect(service.listLocal()).toHaveLength(1);
    expect(store.snapshot).toHaveLength(1);

    await service.reset();
    expect(listener.state.started).toBe(false);
    expect(service.listLocal()).toHaveLength(0);
    expect(store.snapshot).toEqual([]);
    listener.emit(notification({ title: 'after reset' }));
    expect(service.listLocal()).toHaveLength(0);
  });
});
