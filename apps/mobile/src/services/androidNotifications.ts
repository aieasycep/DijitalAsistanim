/**
 * Android notification intelligence bridge (no-op on iOS / web).
 *
 * Native side (modules/notification-listener): the NotificationListenerService filters OTP / 2FA codes,
 * credentials, authenticator / password-manager / banking apps and non-allow-listed messaging apps on
 * device and hands accepted items to JS over `notificationPosted`. Nothing is written to disk natively.
 *
 * This service:
 *  - pushes the user's scope / allow-list (from `ds.profile.getPreferences()`) to the native filter,
 *  - re-applies the same filter in TS (second line of defence) and de-duplicates by fingerprint,
 *  - batches accepted items (≤ 100) to `ds.androidNotifications.ingest` ONLY when
 *    `androidNotificationUploadConsent` is true (retry once, then requeue with a bounded attempt count),
 *  - without consent keeps items in memory only, exposed via `listLocal()` for the settings preview.
 *
 * Wire-up: call `androidNotifications.initialize(ds)` once the user is signed in and
 * `androidNotifications.reset()` on sign-out; `useAndroidNotifications()` drives the settings screen.
 */
import type { DataSource } from '@da/api-client';
import type { UserPreferences } from '@da/domain';
import { androidNotificationIngestSchema } from '@da/validation';
import * as NotificationListener from '../../modules/notification-listener';
import type {
  CapturedNotification,
  InstalledApp,
  NotificationSubscription,
} from '../../modules/notification-listener';
import { captureError } from '@/lib/monitoring';
import { CacheKeys, readCache, writeCache } from '@/lib/storage';
import { useSessionStore } from '@/store/session';
import {
  FingerprintMemory,
  MAX_INGEST_BATCH,
  MAX_LOCAL_ITEMS,
  chunk,
  filterNotification,
  type NotificationFilterConfig,
} from './androidNotificationFilter';

export type AndroidNotificationPreferences = Pick<
  UserPreferences,
  'androidNotificationScope' | 'androidAllowedPackages' | 'androidNotificationUploadConsent'
>;

export type IngestItem = CapturedNotification;

/** Subset of the notification-listener module used by the service (injectable for tests). */
export type NotificationListenerPort = Pick<
  typeof NotificationListener,
  | 'isSupported'
  | 'isPermissionGranted'
  | 'openPermissionSettings'
  | 'getInstalledApps'
  | 'setAllowedPackages'
  | 'setScope'
  | 'start'
  | 'stop'
  | 'addNotificationListener'
>;

/** Persists seen fingerprints only (opaque hashes — never notification content). */
export interface FingerprintStore {
  read(): readonly string[];
  write(fingerprints: readonly string[]): void;
}

export interface AndroidNotificationsServiceOptions {
  listener?: NotificationListenerPort;
  fingerprintStore?: FingerprintStore;
  reportError?: (error: unknown, context?: Record<string, unknown>) => void;
  delay?: (ms: number) => Promise<void>;
  /** Debounce between an incoming notification and the upload batch. */
  flushDebounceMs?: number;
}

export interface FlushResult {
  uploaded: number;
  rejected: number;
  failed: number;
}

export type IncomingOutcome = 'queued' | 'local' | 'rejected' | 'duplicate' | 'unsupported';

interface OutboxEntry {
  item: IngestItem;
  attempts: number;
}

const SEEN_FINGERPRINTS_KEY = 'android.notifications.seen.v1';
const RETRY_DELAY_MS = 1_500;
const MAX_OUTBOX = 200;
const MAX_UPLOAD_ATTEMPTS = 3;
const DEFAULT_FLUSH_DEBOUNCE_MS = 2_000;

const DEFAULT_PREFERENCES: AndroidNotificationPreferences = {
  androidNotificationScope: 'all_allowed',
  androidAllowedPackages: [],
  androidNotificationUploadConsent: false,
};

const defaultFingerprintStore: FingerprintStore = {
  read: () => readCache<string[]>(SEEN_FINGERPRINTS_KEY) ?? [],
  write: (fingerprints) => writeCache(SEEN_FINGERPRINTS_KEY, [...fingerprints]),
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function uniquePackages(packages: readonly string[]): string[] {
  const out = new Set<string>();
  for (const raw of packages) {
    const value = raw.trim();
    if (value.length > 0) out.add(value);
  }
  return [...out];
}

function isValidIngestItem(item: IngestItem): boolean {
  return androidNotificationIngestSchema.safeParse({ items: [item] }).success;
}

export class AndroidNotificationsService {
  private readonly listener: NotificationListenerPort;
  private readonly fingerprintStore: FingerprintStore;
  private readonly reportError: (error: unknown, context?: Record<string, unknown>) => void;
  private readonly delay: (ms: number) => Promise<void>;
  private readonly flushDebounceMs: number;

  private ds: DataSource | null = null;
  private filterConfig: NotificationFilterConfig = { scope: 'all_allowed', allowedPackages: [] };
  private uploadConsent = false;
  private seen: FingerprintMemory | null = null;
  private outbox: OutboxEntry[] = [];
  private local: IngestItem[] = [];
  private subscription: NotificationSubscription | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<FlushResult> | null = null;

  constructor(options: AndroidNotificationsServiceOptions = {}) {
    this.listener = options.listener ?? NotificationListener;
    this.fingerprintStore = options.fingerprintStore ?? defaultFingerprintStore;
    this.reportError = options.reportError ?? captureError;
    this.delay = options.delay ?? sleep;
    this.flushDebounceMs = options.flushDebounceMs ?? DEFAULT_FLUSH_DEBOUNCE_MS;
  }

  /** `true` only on Android with the native module linked. */
  get isSupported(): boolean {
    return this.listener.isSupported();
  }

  get uploadConsentGranted(): boolean {
    return this.uploadConsent;
  }

  get filter(): NotificationFilterConfig {
    return this.filterConfig;
  }

  /** Items accepted but not yet uploaded (upload consent on) — in memory only. */
  get pendingUploadCount(): number {
    return this.outbox.length;
  }

  /** Loads preferences, pushes them natively, subscribes to events and enables capture. */
  async initialize(ds: DataSource): Promise<void> {
    if (!this.isSupported) return;
    this.ds = ds;
    await this.applyPreferences(await this.loadPreferences(ds));
    this.ensureSubscription();
    await this.listener.start();
  }

  /** Re-applies scope / allow-list / consent (call after `profile.updatePreferences`). */
  async applyPreferences(prefs: AndroidNotificationPreferences): Promise<void> {
    if (!this.isSupported) return;
    const allowedPackages = uniquePackages(prefs.androidAllowedPackages);
    this.filterConfig = { scope: prefs.androidNotificationScope, allowedPackages };
    this.uploadConsent = prefs.androidNotificationUploadConsent;
    if (!this.uploadConsent) {
      // Consent withdrawn: whatever was waiting for upload is dropped, never sent.
      this.outbox = [];
      this.clearFlushTimer();
    }
    await Promise.all([
      this.listener.setScope(prefs.androidNotificationScope),
      this.listener.setAllowedPackages(allowedPackages),
    ]);
  }

  isPermissionGranted(): boolean {
    return this.isSupported && this.listener.isPermissionGranted();
  }

  /** Re-checks the OS toggle (call on app foreground) and keeps capture enabled. */
  async refreshPermission(): Promise<boolean> {
    if (!this.isSupported) return false;
    await this.listener.start();
    return this.listener.isPermissionGranted();
  }

  /** Opens the system "Notification access" screen. Resolves `true` when a settings screen opened. */
  async openSettings(): Promise<boolean> {
    if (!this.isSupported) return false;
    const result = await this.listener.openPermissionSettings();
    return result.supported && result.opened;
  }

  async installedApps(): Promise<InstalledApp[]> {
    if (!this.isSupported) return [];
    const result = await this.listener.getInstalledApps();
    return result.supported ? result.apps : [];
  }

  /**
   * Entry point for native events (also used by tests). Applies the TS filter, de-duplicates and either
   * queues for upload (consent on) or keeps the item locally (consent off).
   */
  handleIncoming(item: CapturedNotification): IncomingOutcome {
    if (!this.isSupported) return 'unsupported';
    const decision = filterNotification(item, this.filterConfig);
    if (!decision.accepted) return 'rejected';
    const seen = this.seenMemory();
    if (!seen.add(item.fingerprint)) return 'duplicate';
    this.persistSeen(seen);
    if (this.uploadConsent) {
      this.enqueue({ item, attempts: 0 });
      this.scheduleFlush();
      return 'queued';
    }
    this.local.unshift(item);
    if (this.local.length > MAX_LOCAL_ITEMS) this.local.length = MAX_LOCAL_ITEMS;
    return 'local';
  }

  /** Uploads everything queued (consent on). Concurrent calls share one in-flight upload. */
  flush(): Promise<FlushResult> {
    if (this.inFlight) return this.inFlight;
    this.clearFlushTimer();
    const run = this.flushInternal().finally(() => {
      this.inFlight = null;
    });
    this.inFlight = run;
    return run;
  }

  /** Items captured while upload consent is off — device memory only. */
  listLocal(): readonly IngestItem[] {
    return this.local;
  }

  clearLocal(): void {
    this.local = [];
  }

  /** Sign-out: stop capture, drop everything in memory and forget seen fingerprints. */
  async reset(): Promise<void> {
    this.clearFlushTimer();
    this.subscription?.remove();
    this.subscription = null;
    this.outbox = [];
    this.local = [];
    this.seen = null;
    this.uploadConsent = false;
    this.filterConfig = { scope: 'all_allowed', allowedPackages: [] };
    this.ds = null;
    try {
      this.fingerprintStore.write([]);
    } catch (error) {
      this.reportError(error, { where: 'androidNotifications.reset' });
    }
    if (this.isSupported) await this.listener.stop();
  }

  private async loadPreferences(ds: DataSource): Promise<AndroidNotificationPreferences> {
    try {
      return await ds.profile.getPreferences();
    } catch {
      // Offline: fall back to the session store, then the encrypted cache, then safe defaults.
      const cached =
        useSessionStore.getState().preferences ?? readCache<UserPreferences>(CacheKeys.preferences);
      return cached ?? DEFAULT_PREFERENCES;
    }
  }

  private ensureSubscription(): void {
    if (this.subscription) return;
    this.subscription = this.listener.addNotificationListener((item) => {
      this.handleIncoming(item);
    });
  }

  private seenMemory(): FingerprintMemory {
    if (this.seen) return this.seen;
    let initial: readonly string[] = [];
    try {
      initial = this.fingerprintStore.read();
    } catch (error) {
      this.reportError(error, { where: 'androidNotifications.readSeen' });
    }
    this.seen = new FingerprintMemory(initial);
    return this.seen;
  }

  private persistSeen(seen: FingerprintMemory): void {
    try {
      this.fingerprintStore.write(seen.toArray());
    } catch (error) {
      this.reportError(error, { where: 'androidNotifications.persistSeen' });
    }
  }

  private enqueue(entry: OutboxEntry): void {
    this.outbox.push(entry);
    if (this.outbox.length > MAX_OUTBOX) this.outbox.splice(0, this.outbox.length - MAX_OUTBOX);
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, this.flushDebounceMs);
  }

  private clearFlushTimer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  private async flushInternal(): Promise<FlushResult> {
    const result: FlushResult = { uploaded: 0, rejected: 0, failed: 0 };
    const ds = this.ds;
    if (!this.isSupported || !ds || !this.uploadConsent || this.outbox.length === 0) return result;

    const batch = this.outbox;
    this.outbox = [];
    const accepted: OutboxEntry[] = [];
    for (const entry of batch) {
      // Re-check right before upload: the allow-list may have changed since capture.
      const decision = filterNotification(entry.item, this.filterConfig);
      if (!decision.accepted || !isValidIngestItem(entry.item)) {
        result.rejected += 1;
        continue;
      }
      accepted.push(entry);
    }

    for (const part of chunk(accepted, MAX_INGEST_BATCH)) {
      const ok = await this.uploadWithRetry(
        ds,
        part.map((entry) => entry.item),
      );
      if (ok) {
        result.uploaded += part.length;
        continue;
      }
      result.failed += part.length;
      for (const entry of part) {
        const attempts = entry.attempts + 1;
        if (attempts < MAX_UPLOAD_ATTEMPTS) this.enqueue({ item: entry.item, attempts });
      }
    }
    return result;
  }

  /** One retry after a short delay; the caller requeues on a second failure. */
  private async uploadWithRetry(ds: DataSource, items: IngestItem[]): Promise<boolean> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await ds.androidNotifications.ingest(items);
        return true;
      } catch (error) {
        lastError = error;
        if (attempt === 0) await this.delay(RETRY_DELAY_MS);
      }
    }
    this.reportError(lastError, { where: 'androidNotifications.ingest', count: items.length });
    return false;
  }
}

/** App-wide singleton used by the hook and the session bootstrap. */
export const androidNotifications = new AndroidNotificationsService();
