import { afterEach, describe, expect, it } from 'vitest';
import {
  CompositeHealthDataProvider,
  ManualHealthDataProvider,
  MockHealthDataProvider,
  StravaProvider,
  AsyncStorageTokenStore,
  type HealthDataProvider,
} from '../lib/health';
import type { BodyWeightSample } from '../types/health';

afterEach(async () => {
  await ManualHealthDataProvider.purge();
  await AsyncStorageTokenStore.purge();
});

describe('Mock.getBodyWeightRange', () => {
  it('produces 5–15 samples over a 14-day window, all source=mock', async () => {
    const p = new MockHealthDataProvider({ seed: 42, weightKg: 75 });
    const out = await p.getBodyWeightRange(new Date('2026-05-14'), new Date('2026-05-27'));
    expect(out.length).toBeGreaterThan(3);
    expect(out.length).toBeLessThan(15);
    for (const w of out) {
      expect(w.source).toBe('mock');
      expect(Math.abs(w.weightKg - 75)).toBeLessThan(1);
    }
  });

  it('deterministic for same seed', async () => {
    const a = new MockHealthDataProvider({ seed: 7, weightKg: 80 });
    const b = new MockHealthDataProvider({ seed: 7, weightKg: 80 });
    const ra = await a.getBodyWeightRange(new Date('2026-05-01'), new Date('2026-05-30'));
    const rb = await b.getBodyWeightRange(new Date('2026-05-01'), new Date('2026-05-30'));
    expect(ra).toEqual(rb);
  });
});

describe('Manual.getBodyWeightRange', () => {
  it('returns empty when nothing recorded', async () => {
    const p = new ManualHealthDataProvider();
    const out = await p.getBodyWeightRange(new Date('2026-05-01'), new Date('2026-05-30'));
    expect(out).toEqual([]);
  });

  it('returns only weights within the requested range', async () => {
    const p = new ManualHealthDataProvider();
    await p.recordWeight({ date: '2026-04-20', weightKg: 81, source: 'manual' });
    await p.recordWeight({ date: '2026-05-05', weightKg: 80, source: 'manual' });
    await p.recordWeight({ date: '2026-05-15', weightKg: 79.5, source: 'manual' });
    await p.recordWeight({ date: '2026-06-05', weightKg: 79, source: 'manual' });
    const out = await p.getBodyWeightRange(new Date('2026-05-01'), new Date('2026-05-31'));
    expect(out.map(w => w.date)).toEqual(['2026-05-05', '2026-05-15']);
  });
});

describe('Strava / Whoop / native stubs', () => {
  it('Strava returns empty (no body composition data)', async () => {
    const store = new AsyncStorageTokenStore();
    await store.setToken('strava', { accessToken: 't' });
    const p = new StravaProvider(store);
    const out = await p.getBodyWeightRange(new Date('2026-05-01'), new Date('2026-05-30'));
    expect(out).toEqual([]);
  });
});

describe('Composite.getBodyWeightRange', () => {
  it('merges per-date — first provider with data wins', async () => {
    const apple: HealthDataProvider = makeFake([
      { date: '2026-05-15', weightKg: 80.0, source: 'apple_health' },
    ]);
    const manual: HealthDataProvider = makeFake([
      { date: '2026-05-15', weightKg: 78.0, source: 'manual' },  // ignored — Apple wins
      { date: '2026-05-16', weightKg: 79.5, source: 'manual' },  // kept — no conflict
    ]);
    const composite = new CompositeHealthDataProvider([apple, manual]);
    const out = await composite.getBodyWeightRange(new Date('2026-05-14'), new Date('2026-05-20'));
    expect(out.length).toBe(2);
    expect(out.find(w => w.date === '2026-05-15')?.source).toBe('apple_health');
    expect(out.find(w => w.date === '2026-05-15')?.weightKg).toBe(80.0);
    expect(out.find(w => w.date === '2026-05-16')?.source).toBe('manual');
  });

  it('survives a throwing provider', async () => {
    const broken: HealthDataProvider = makeFake(undefined, true);
    const ok: HealthDataProvider = makeFake([
      { date: '2026-05-15', weightKg: 80.0, source: 'manual' },
    ]);
    const composite = new CompositeHealthDataProvider([broken, ok]);
    const out = await composite.getBodyWeightRange(new Date('2026-05-10'), new Date('2026-05-20'));
    expect(out.length).toBe(1);
    expect(out[0].weightKg).toBe(80.0);
  });

  it('returns empty when all sources empty', async () => {
    const a = makeFake([]);
    const b = makeFake([]);
    const composite = new CompositeHealthDataProvider([a, b]);
    expect(await composite.getBodyWeightRange(new Date(), new Date())).toEqual([]);
  });
});

function makeFake(weights: BodyWeightSample[] | undefined, shouldThrow = false): HealthDataProvider {
  return {
    name: 'mock',
    isAvailable: async () => true,
    getPermissionStatus: async () => 'granted',
    requestPermissions: async (types) => ({ status: 'granted', granted: types, denied: [] }),
    getDailyActivityRange: async () => [],
    getWorkoutSummaries: async () => [],
    getLatestBodyWeight: async () => weights?.[0] ?? null,
    getBodyWeightRange: async () => {
      if (shouldThrow) throw new Error('boom');
      return weights ?? [];
    },
    getSleepSummary: async () => [],
    getRestingHeartRate: async () => null,
    getHrv: async () => null,
    getRecoveryInputs: async () => [],
  };
}
