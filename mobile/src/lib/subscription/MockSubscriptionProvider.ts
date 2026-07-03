import { loadSubscriptionStatus, saveSubscriptionStatus } from '../../services/storage';
import type { Locale } from '../i18n/types';
import {
  getFallbackPackages,
  type SubscriptionPackage,
  type SubscriptionPlanId,
  type SubscriptionProvider,
  type SubscriptionStatus,
} from './SubscriptionProvider';

/**
 * Dev / Expo Go / no-keys provider. Persists a local flag instead of charging —
 * lets the paywall, the Coach free-teaser and all gated flows work end-to-end
 * without a configured store. Never used in a production build that ships a
 * RevenueCat key (the factory picks RevenueCat then).
 */
export class MockSubscriptionProvider implements SubscriptionProvider {
  constructor(private readonly allowLocalEntitlement = true) {}

  isAvailable(): boolean {
    return false;
  }

  async configure(): Promise<void> {
    // no-op
  }

  async getOfferings(locale?: Locale): Promise<SubscriptionPackage[]> {
    return getFallbackPackages(locale);
  }

  async getStatus(): Promise<SubscriptionStatus> {
    return { isActive: this.allowLocalEntitlement ? await loadSubscriptionStatus() : false, source: 'mock' };
  }

  async purchase(planId: SubscriptionPlanId): Promise<SubscriptionStatus> {
    if (!this.allowLocalEntitlement) {
      return { isActive: false, planId, source: 'mock' };
    }
    await saveSubscriptionStatus(true);
    return { isActive: true, planId, source: 'mock' };
  }

  async restore(): Promise<SubscriptionStatus> {
    return { isActive: this.allowLocalEntitlement ? await loadSubscriptionStatus() : false, source: 'mock' };
  }
}
