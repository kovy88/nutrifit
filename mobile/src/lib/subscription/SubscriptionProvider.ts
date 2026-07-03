// ── SUBSCRIPTION PROVIDER (monetization abstraction)
//
// Mirrors the HealthDataProvider pattern: a small interface with a Mock impl
// (dev / Expo Go / no keys) and a RevenueCat impl (optional native dep, loaded
// via dynamic import) for production. UI and TrenrContext talk to a provider via
// the factory — never to a billing SDK directly — so the app builds and tests
// green WITHOUT the native package installed. Wiring a real store is then just:
//   1. `npx expo install react-native-purchases`
//   2. set EXPO_PUBLIC_REVENUECAT_IOS_KEY / _ANDROID_KEY
//   3. configure products + a "premium" entitlement in the RevenueCat dashboard
//   4. EAS build (the SDK is native — not available in Expo Go)
// See docs/monetization.md.

import type { Locale } from '../i18n/types';

export const PREMIUM_ENTITLEMENT = 'premium';

export type SubscriptionPlanId = 'monthly' | 'yearly';

export type SubscriptionPackage = {
  planId: SubscriptionPlanId;
  /** Localised price string from the store at runtime, e.g. "$9.99". */
  priceString: string;
  /** Store product identifier (analytics / debugging). */
  productId: string;
};

export type SubscriptionStatus = {
  isActive: boolean;
  planId?: SubscriptionPlanId | null;
  willRenew?: boolean;
  /** ISO expiry when known. */
  expiresAt?: string | null;
  source: 'revenuecat' | 'mock';
};

export interface SubscriptionProvider {
  /** True when real billing is wired (native module + API key present). */
  isAvailable(): boolean;
  /** Configure the SDK and identify the user. Call once after auth resolves. */
  configure(userId?: string | null): Promise<void>;
  /** Live packages with store prices (empty if offerings can't load). `locale`
   *  only affects the Mock provider's fallback strings — a real store already
   *  returns prices localised to the device. */
  getOfferings(locale?: Locale): Promise<SubscriptionPackage[]>;
  /** Current entitlement. */
  getStatus(): Promise<SubscriptionStatus>;
  /** Purchase a plan; resolves with the new status. Throws on failure/cancel. */
  purchase(planId: SubscriptionPlanId): Promise<SubscriptionStatus>;
  /** Restore prior purchases (App Store / Play). */
  restore(): Promise<SubscriptionStatus>;
}

/** Shown when live offerings can't be fetched (Expo Go / offline / mock). */
export function getFallbackPackages(locale: Locale = 'cs'): SubscriptionPackage[] {
  if (locale === 'en') {
    return [
      { planId: 'monthly', priceString: '$6.99', productId: 'trenr_premium_monthly' },
      { planId: 'yearly', priceString: '$59.99', productId: 'trenr_premium_yearly' },
    ];
  }
  return [
    { planId: 'monthly', priceString: '149 Kč', productId: 'trenr_premium_monthly' },
    { planId: 'yearly', priceString: '1 290 Kč', productId: 'trenr_premium_yearly' },
  ];
}
