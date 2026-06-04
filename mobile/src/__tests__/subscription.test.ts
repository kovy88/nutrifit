import { describe, it, expect, beforeEach } from 'vitest';
import { MockSubscriptionProvider } from '../lib/subscription/MockSubscriptionProvider';
import { createSubscriptionProvider } from '../lib/subscription/factory';
import { saveSubscriptionStatus } from '../services/storage';

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
