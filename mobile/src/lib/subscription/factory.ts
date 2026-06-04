import { MockSubscriptionProvider } from './MockSubscriptionProvider';
import { RevenueCatSubscriptionProvider } from './RevenueCatSubscriptionProvider';
import type { SubscriptionProvider } from './SubscriptionProvider';

function isUnitTestRuntime(): boolean {
  return Boolean((globalThis as any).__NUTRIFIT_TEST__);
}

let singleton: SubscriptionProvider | null = null;

/**
 * Real RevenueCat billing when an API key is configured (production EAS build);
 * otherwise a local Mock so dev / Expo Go still exercises the full paywall +
 * teaser + gating flow without a store.
 */
export function createSubscriptionProvider(): SubscriptionProvider {
  if (!isUnitTestRuntime() && RevenueCatSubscriptionProvider.hasKey()) {
    return new RevenueCatSubscriptionProvider();
  }
  return new MockSubscriptionProvider();
}

/** App-wide singleton (configure once, read entitlement anywhere). */
export function getSubscriptionProvider(): SubscriptionProvider {
  if (!singleton) singleton = createSubscriptionProvider();
  return singleton;
}
