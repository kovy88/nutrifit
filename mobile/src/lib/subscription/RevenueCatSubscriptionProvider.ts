// Real billing via RevenueCat. `react-native-purchases` is an OPTIONAL native
// dependency loaded with a dynamic import (same pattern as AppleHealthProvider),
// so the app compiles and tests pass without it. Active only in a production EAS
// build where the package is installed and an API key is configured.

import { Platform } from 'react-native';
import type { Locale } from '../i18n/types';
import {
  PREMIUM_ENTITLEMENT,
  type SubscriptionPackage,
  type SubscriptionPlanId,
  type SubscriptionProvider,
  type SubscriptionStatus,
} from './SubscriptionProvider';

function apiKey(): string | null {
  const key =
    Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
      : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
  return key && key.length > 0 ? key : null;
}

let purchasesModule: any | null = null;
let configured = false;

async function loadPurchases(): Promise<any | null> {
  if (purchasesModule) return purchasesModule;
  try {
    // @ts-ignore — optional native dep; installed only for production EAS builds
    const mod = await import('react-native-purchases');
    purchasesModule = mod?.default ?? mod;
    return purchasesModule;
  } catch {
    return null;
  }
}

/** Product IDs configured in App Store Connect / Play Console + the
 *  RevenueCat dashboard — must match FALLBACK_PACKAGES in
 *  SubscriptionProvider.ts. `purchase()` matches against these exactly;
 *  never falls back to a heuristic guess when real money is involved. */
export const KNOWN_PRODUCT_IDS: Record<SubscriptionPlanId, string> = {
  monthly: 'trenr_premium_monthly',
  yearly: 'trenr_premium_yearly',
};

export function packageProductId(pkg: any): string {
  return String(pkg?.product?.identifier ?? pkg?.identifier ?? '').toLowerCase();
}

/** Best-effort classification for display only (e.g. the paywall's
 *  monthly/yearly price labels) — falls back to a substring heuristic if the
 *  dashboard's product ID doesn't match our exact naming convention. Never
 *  used to decide what a purchase actually charges; see `purchase()`. */
export function planFromPackage(pkg: any): SubscriptionPlanId {
  const id = packageProductId(pkg);
  if (id === KNOWN_PRODUCT_IDS.yearly) return 'yearly';
  if (id === KNOWN_PRODUCT_IDS.monthly) return 'monthly';
  return id.includes('year') || id.includes('annual') ? 'yearly' : 'monthly';
}

function statusFromInfo(info: any): SubscriptionStatus {
  const entitlement = info?.entitlements?.active?.[PREMIUM_ENTITLEMENT];
  return {
    isActive: Boolean(entitlement),
    willRenew: entitlement?.willRenew,
    expiresAt: entitlement?.expirationDate ?? null,
    source: 'revenuecat',
  };
}

export class RevenueCatSubscriptionProvider implements SubscriptionProvider {
  static hasKey(): boolean {
    return apiKey() != null;
  }

  isAvailable(): boolean {
    return apiKey() != null;
  }

  async configure(userId?: string | null): Promise<void> {
    const Purchases = await loadPurchases();
    const key = apiKey();
    if (!Purchases || !key) return;
    if (!configured) {
      Purchases.configure({ apiKey: key, appUserID: userId ?? undefined });
      configured = true;
    } else if (userId) {
      try {
        await Purchases.logIn(userId);
      } catch {
        // identity sync is best-effort
      }
    }
  }

  async getOfferings(_locale?: Locale): Promise<SubscriptionPackage[]> {
    const Purchases = await loadPurchases();
    if (!Purchases) return [];
    try {
      const offerings = await Purchases.getOfferings();
      const pkgs = offerings?.current?.availablePackages ?? [];
      return pkgs.map((p: any) => ({
        planId: planFromPackage(p),
        priceString: p?.product?.priceString ?? '',
        productId: p?.product?.identifier ?? '',
      }));
    } catch {
      return [];
    }
  }

  async getStatus(): Promise<SubscriptionStatus> {
    const Purchases = await loadPurchases();
    if (!Purchases) return { isActive: false, source: 'revenuecat' };
    try {
      return statusFromInfo(await Purchases.getCustomerInfo());
    } catch {
      return { isActive: false, source: 'revenuecat' };
    }
  }

  async purchase(planId: SubscriptionPlanId): Promise<SubscriptionStatus> {
    const Purchases = await loadPurchases();
    if (!Purchases) throw new Error('billing_unavailable');
    const offerings = await Purchases.getOfferings();
    const pkgs = offerings?.current?.availablePackages ?? [];
    // Exact productId match only — never fall back to a heuristic guess or
    // "whatever package happened to be first" when actual money is involved.
    const pkg = pkgs.find((p: any) => packageProductId(p) === KNOWN_PRODUCT_IDS[planId]);
    if (!pkg) throw new Error('no_package');
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return statusFromInfo(customerInfo);
  }

  async restore(): Promise<SubscriptionStatus> {
    const Purchases = await loadPurchases();
    if (!Purchases) throw new Error('billing_unavailable');
    return statusFromInfo(await Purchases.restorePurchases());
  }
}
