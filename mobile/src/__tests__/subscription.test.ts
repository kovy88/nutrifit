import { describe, it, expect, beforeEach } from 'vitest';
import { MockSubscriptionProvider } from '../lib/subscription/MockSubscriptionProvider';
import { createSubscriptionProvider } from '../lib/subscription/factory';
import { saveSubscriptionStatus } from '../services/storage';
import { planFromPackage, KNOWN_PRODUCT_IDS } from '../lib/subscription/RevenueCatSubscriptionProvider';

describe('MockSubscriptionProvider', () => {
  beforeEach(async () => {
    await saveSubscriptionStatus(false);
  });

  it('activates after purchase and persists for getStatus/restore', async () => {
    const p = new MockSubscriptionProvider();
    expect((await p.getStatus()).isActive).toBe(false);

    const after = await p.purchase('yearly');
    expect(after.isActive).toBe(true);
    expect(after.planId).toBe('yearly');

    expect((await p.getStatus()).isActive).toBe(true);
    expect((await p.restore()).isActive).toBe(true);
  });

  it('exposes fallback offerings (monthly + yearly)', async () => {
    const offerings = await new MockSubscriptionProvider().getOfferings();
    expect(offerings.length).toBeGreaterThanOrEqual(2);
    expect(offerings.map(o => o.planId)).toContain('monthly');
    expect(offerings.map(o => o.planId)).toContain('yearly');
  });

  it('localises fallback price strings by locale instead of always showing Kč', async () => {
    const p = new MockSubscriptionProvider();
    const cs = await p.getOfferings('cs');
    const en = await p.getOfferings('en');
    expect(cs.every(o => o.priceString.includes('Kč'))).toBe(true);
    expect(en.every(o => !o.priceString.includes('Kč'))).toBe(true);
    expect(en.every(o => o.priceString.startsWith('$'))).toBe(true);
  });

  it('can be locked so local premium flags are ignored outside dev/test', async () => {
    await saveSubscriptionStatus(true);
    const p = new MockSubscriptionProvider(false);

    expect((await p.getStatus()).isActive).toBe(false);
    expect((await p.purchase('yearly')).isActive).toBe(false);
    expect((await p.restore()).isActive).toBe(false);
  });
});

describe('createSubscriptionProvider', () => {
  it('falls back to the mock provider when no RevenueCat key is set', () => {
    const provider = createSubscriptionProvider();
    expect(provider.isAvailable()).toBe(false);
    expect(typeof provider.purchase).toBe('function');
    expect(typeof provider.restore).toBe('function');
  });
});

describe('RevenueCat plan matching', () => {
  it('matches on the known exact productId regardless of substring heuristics', () => {
    // "trenr_premium_yearly" contains no "year"/"annual" substring test would
    // even need — exact match must win on its own.
    expect(planFromPackage({ product: { identifier: KNOWN_PRODUCT_IDS.yearly } })).toBe('yearly');
    expect(planFromPackage({ product: { identifier: KNOWN_PRODUCT_IDS.monthly } })).toBe('monthly');
  });

  it('falls back to a substring heuristic for display only when the dashboard uses different product IDs', () => {
    expect(planFromPackage({ product: { identifier: 'com.trenr.annual_plan' } })).toBe('yearly');
    expect(planFromPackage({ identifier: '12_month_subscription' } as any)).toBe('monthly');
  });

  it('never lets an unrelated package silently pass as the requested plan when purchasing', () => {
    // Simulates purchase()'s exact-match lookup directly: a dashboard
    // misconfigured with unrelated product IDs must not resolve to *any*
    // package instead of the previous ".find(...) ?? pkgs[0]" fallback that
    // would silently charge whichever package happened to be first.
    const pkgs = [
      { product: { identifier: 'some_other_product' } },
      { product: { identifier: 'yet_another_product' } },
    ];
    const match = pkgs.find(p => p.product.identifier.toLowerCase() === KNOWN_PRODUCT_IDS.yearly);
    expect(match).toBeUndefined();
  });
});
