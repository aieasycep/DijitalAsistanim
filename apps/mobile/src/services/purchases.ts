/**
 * RevenueCat (react-native-purchases) wrapper. The SDK is loaded lazily and only configured when a store
 * key exists and the app is a real build (never in Expo Go), so the paywall degrades to "Mağaza şu an
 * kullanılamıyor." instead of crashing. Entitlement truth for the UI still comes from the backend
 * (`ds.billing.getEntitlement`); this module only drives store interactions and links the app user id.
 */
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Application from 'expo-application';
import type * as PurchasesNamespace from 'react-native-purchases';
import type {
  CustomerInfo,
  PurchasesError,
  PurchasesOfferings,
  PurchasesPackage,
} from 'react-native-purchases';
import type { DataSource } from '@da/api-client';
import type { EntitlementState } from '@da/domain';
import { env } from '@/lib/env';
import { captureError } from '@/lib/monitoring';
import { openExternal } from '@/lib/openExternal';

type PurchasesModule = typeof PurchasesNamespace;

let moduleRef: PurchasesModule | null | undefined;
let configured = false;

function loadPurchases(): PurchasesModule | null {
  if (moduleRef !== undefined) return moduleRef;
  try {
    moduleRef = require('react-native-purchases') as PurchasesModule;
  } catch {
    moduleRef = null;
  }
  return moduleRef;
}

export function purchasesApiKey(): string | undefined {
  if (Platform.OS === 'ios') return env.revenueCatIosKey;
  if (Platform.OS === 'android') return env.revenueCatAndroidKey;
  return undefined;
}

/** True when the store SDK can be used on this build (key present, native module linked, not Expo Go). */
export function isPurchasesAvailable(): boolean {
  if (!purchasesApiKey()) return false;
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return false;
  return loadPurchases() !== null;
}

function asPurchasesError(e: unknown): Partial<PurchasesError> {
  return e && typeof e === 'object' ? (e as Partial<PurchasesError>) : {};
}

/** Configures the SDK once. Returns whether purchases are usable. */
export async function configurePurchases(appUserId?: string | null): Promise<boolean> {
  if (!isPurchasesAvailable()) return false;
  if (configured) return true;
  const mod = loadPurchases();
  const apiKey = purchasesApiKey();
  if (!mod || !apiKey) return false;
  try {
    await mod.default.setLogLevel(env.isProduction ? mod.LOG_LEVEL.ERROR : mod.LOG_LEVEL.WARN);
    mod.default.configure({ apiKey, appUserID: appUserId ?? null });
    configured = true;
    return true;
  } catch (e) {
    captureError(e, { where: 'configurePurchases' });
    return false;
  }
}

/** Logs the signed-in user into RevenueCat and links the app user id to the profile. */
export async function identifyPurchasesUser(
  userId: string,
  ds?: DataSource,
): Promise<CustomerInfo | null> {
  if (!(await configurePurchases(userId))) return null;
  const mod = loadPurchases();
  if (!mod) return null;
  try {
    const { customerInfo } = await mod.default.logIn(userId);
    if (ds) {
      try {
        await ds.billing.linkRevenueCatUser(await mod.default.getAppUserID());
      } catch (e) {
        captureError(e, { where: 'linkRevenueCatUser' });
      }
    }
    return customerInfo;
  } catch (e) {
    captureError(e, { where: 'identifyPurchasesUser' });
    return null;
  }
}

/** Sign-out: detach the store identity (anonymous users cannot log out — that is not an error). */
export async function resetPurchasesUser(): Promise<void> {
  const mod = loadPurchases();
  if (!mod || !configured) return;
  try {
    await mod.default.logOut();
  } catch (e) {
    if (asPurchasesError(e).code !== mod.PURCHASES_ERROR_CODE.LOG_OUT_ANONYMOUS_USER_ERROR)
      captureError(e, { where: 'resetPurchasesUser' });
  }
}

export interface ProOfferings {
  monthly: PurchasesPackage | null;
  annual: PurchasesPackage | null;
  monthlyPriceLabel: string | null;
  annualPriceLabel: string | null;
  /** Only true when the store product declares an introductory (trial) offer — drives "7 Gün Ücretsiz". */
  hasIntroOffer: boolean;
}

/** Picks the monthly / annual packages by product id (falls back to package type). Pure. */
export function selectProPackages(
  offerings: PurchasesOfferings | null,
  productIds: { monthly: string; annual: string },
): ProOfferings {
  const packages = offerings?.current?.availablePackages ?? [];
  const byId = (id: string) => packages.find((p) => p.product.identifier === id) ?? null;
  const byType = (type: string) => packages.find((p) => String(p.packageType) === type) ?? null;
  const monthly = byId(productIds.monthly) ?? byType('MONTHLY');
  const annual = byId(productIds.annual) ?? byType('ANNUAL');
  return {
    monthly,
    annual,
    monthlyPriceLabel: monthly?.product.priceString ?? null,
    annualPriceLabel: annual?.product.priceString ?? null,
    hasIntroOffer: [monthly, annual].some((p) => Boolean(p?.product.introPrice)),
  };
}

export async function getProOfferings(): Promise<ProOfferings | null> {
  if (!(await configurePurchases())) return null;
  const mod = loadPurchases();
  if (!mod) return null;
  try {
    return selectProPackages(await mod.default.getOfferings(), {
      monthly: env.rcProductMonthly,
      annual: env.rcProductAnnual,
    });
  } catch (e) {
    captureError(e, { where: 'getProOfferings' });
    return null;
  }
}

export type PurchaseOutcome = 'purchased' | 'cancelled' | 'pending' | 'failed' | 'unavailable';

export interface PurchaseResult {
  outcome: PurchaseOutcome;
  customerInfo: CustomerInfo | null;
}

export function isProActive(info: CustomerInfo | null | undefined): boolean {
  return Boolean(info?.entitlements.active[env.rcEntitlementId]?.isActive);
}

export async function purchasePro(pkg: PurchasesPackage): Promise<PurchaseResult> {
  if (!(await configurePurchases())) return { outcome: 'unavailable', customerInfo: null };
  const mod = loadPurchases();
  if (!mod) return { outcome: 'unavailable', customerInfo: null };
  try {
    const { customerInfo } = await mod.default.purchasePackage(pkg);
    return { outcome: isProActive(customerInfo) ? 'purchased' : 'pending', customerInfo };
  } catch (e) {
    const err = asPurchasesError(e);
    if (err.userCancelled || err.code === mod.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR)
      return { outcome: 'cancelled', customerInfo: null };
    if (err.code === mod.PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR)
      return { outcome: 'pending', customerInfo: null };
    captureError(e, { where: 'purchasePro', code: err.code ?? 'unknown' });
    return { outcome: 'failed', customerInfo: null };
  }
}

export interface RestoreResult {
  outcome: 'restored' | 'nothing' | 'failed' | 'unavailable';
  customerInfo: CustomerInfo | null;
}

export async function restorePro(): Promise<RestoreResult> {
  if (!(await configurePurchases())) return { outcome: 'unavailable', customerInfo: null };
  const mod = loadPurchases();
  if (!mod) return { outcome: 'unavailable', customerInfo: null };
  try {
    const customerInfo = await mod.default.restorePurchases();
    return { outcome: isProActive(customerInfo) ? 'restored' : 'nothing', customerInfo };
  } catch (e) {
    captureError(e, { where: 'restorePro' });
    return { outcome: 'failed', customerInfo: null };
  }
}

export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!(await configurePurchases())) return null;
  const mod = loadPurchases();
  if (!mod) return null;
  try {
    return await mod.default.getCustomerInfo();
  } catch (e) {
    captureError(e, { where: 'getCustomerInfo' });
    return null;
  }
}

/** Store-derived entitlement fields (the backend remains the source of truth once the webhook lands). */
export function entitlementFromCustomerInfo(
  info: CustomerInfo | null | undefined,
): Pick<EntitlementState, 'plan' | 'isPro' | 'isTrial' | 'expiresAt' | 'source'> {
  const ent = info?.entitlements.active[env.rcEntitlementId];
  if (!ent?.isActive)
    return { plan: 'free', isPro: false, isTrial: false, expiresAt: null, source: 'none' };
  return {
    plan: 'pro',
    isPro: true,
    isTrial: ent.periodType === 'TRIAL',
    expiresAt: ent.expirationDate ?? null,
    source: 'revenuecat',
  };
}

/** Subscribes to customer-info updates; returns the unsubscribe function. */
export function addProStatusListener(
  listener: (isPro: boolean, info: CustomerInfo) => void,
): () => void {
  const mod = loadPurchases();
  if (!mod || !configured) return () => undefined;
  const wrapped = (info: CustomerInfo) => listener(isProActive(info), info);
  try {
    mod.default.addCustomerInfoUpdateListener(wrapped);
  } catch (e) {
    captureError(e, { where: 'addProStatusListener' });
    return () => undefined;
  }
  return () => {
    try {
      mod.default.removeCustomerInfoUpdateListener(wrapped);
    } catch {
      // listener already gone
    }
  };
}

/** Opens the store's subscription management page (RevenueCat management URL when known). */
export async function openManageSubscriptions(): Promise<boolean> {
  const info = await getCustomerInfo();
  const fallback =
    Platform.OS === 'android'
      ? `https://play.google.com/store/account/subscriptions${Application.applicationId ? `?package=${encodeURIComponent(Application.applicationId)}` : ''}`
      : 'https://apps.apple.com/account/subscriptions';
  return openExternal(info?.managementURL ?? fallback);
}
