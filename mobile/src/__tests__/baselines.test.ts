import { describe, expect, it } from 'vitest';
import { computePersonalBaselines, isBaselineStale } from '../lib/coaching/baselines';
import { evaluateReadiness } from '../lib/coaching/readiness';
import { MockHealthDataProvider } from '../lib/health';
import type { HealthDataProvider } from '../lib/health';

// ── Baseline computation ─────────────────────────────────────────────────────

describe('computePersonalBaselines', () => {
  it('produces RHR + HRV mean from Mock provider over 14 days', async () => {
    const provider = new MockHealthDataProvider({ seed: 42 });
    const baseline = await computePersonalBaselines(provider, { endDate: new Date('2026-05-27'), days: 14 });
    expect(baseline.rhrMeanBpm).not.toBeNull();
    expect(baseline.hrvMeanMs).not.toBeNull();
    expect(baseline.sampleCount.rhr).toBe(13); // days-1, skip today
    expect(baseline.sampleCount.hrv).toBe(13);
  });

  it('RHR baseline falls within plausible adult range', async () => {
    const provider = new MockHealthDataProvider({ seed: 1 });
    const baseline = await computePersonalBaselines(provider, { endDate: new Date('2026-05-27') });
    expect(baseline.rhrMeanBpm).toBeGreaterThan(45);
    expect(baseline.rhrMeanBpm).toBeLessThan(85);
  });

  it('returns null for signals with fewer than 3 samples', async () => {
    // Provider always returns null = no data
    const empty: HealthDataProvider = {
      name: 'mock',
      isAvailable: async () => true,
      getPermissionStatus: async () => 'granted',
      requestPermissions: async (types) => ({ status: 'granted', granted: types, denied: [] }),
      getDailyActivityRange: async () => [],
      getWorkoutSummaries: async () => [],
      getLatestBodyWeight: async () => null,
      getBodyWeightRange: async () => [],
      getSleepSummary: async () => [],
      getRestingHeartRate: async () => null,
      getHrv: async () => null,
      getRecoveryInputs: async () => [],
    };
    const baseline = await computePersonalBaselines(empty);
    expect(baseline.rhrMeanBpm).toBeNull();
    expect(baseline.hrvMeanMs).toBeNull();
    expect(baseline.sampleCount.rhr).toBe(0);
  });

  it('respects custom days parameter', async () => {
    const provider = new MockHealthDataProvider({ seed: 2 });
    const baseline = await computePersonalBaselines(provider, { endDate: new Date('2026-05-27'), days: 7 });
    expect(baseline.sampleCount.rhr).toBe(6); // days - 1
  });

  it('survives a provider that throws', async () => {
    const broken: HealthDataProvider = {
      name: 'mock',
      isAvailable: async () => true,
      getPermissionStatus: async () => 'granted',
      requestPermissions: async (types) => ({ status: 'granted', granted: types, denied: [] }),
      getDailyActivityRange: async () => [],
      getWorkoutSummaries: async () => [],
      getLatestBodyWeight: async () => null,
      getBodyWeightRange: async () => [],
      getSleepSummary: async () => { throw new Error('boom'); },
      getRestingHeartRate: async () => { throw new Error('boom'); },
      getHrv: async () => { throw new Error('boom'); },
      getRecoveryInputs: async () => { throw new Error('boom'); },
    };
    const baseline = await computePersonalBaselines(broken);
    expect(baseline.rhrMeanBpm).toBeNull();
    expect(baseline.sampleCount.rhr).toBe(0);
  });

  it('writes computedAt timestamp', async () => {
    const provider = new MockHealthDataProvider({ seed: 1 });
    const before = Date.now();
    const baseline = await computePersonalBaselines(provider);
    const after = Date.now();
    const t = new Date(baseline.computedAt).getTime();
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(after);
  });
});

describe('isBaselineStale', () => {
  it('fresh baseline (just now) → not stale', () => {
    const baseline = { computedAt: new Date().toISOString() } as any;
    expect(isBaselineStale(baseline, 24)).toBe(false);
  });

  it('25-hour-old baseline with 24h TTL → stale', () => {
    const baseline = { computedAt: new Date(Date.now() - 25 * 3600_000).toISOString() } as any;
    expect(isBaselineStale(baseline, 24)).toBe(true);
  });

  it('23-hour-old baseline with 24h TTL → not stale', () => {
    const baseline = { computedAt: new Date(Date.now() - 23 * 3600_000).toISOString() } as any;
    expect(isBaselineStale(baseline, 24)).toBe(false);
  });
});

// ── evaluateReadiness with baseline (relative thresholds) ────────────────────

describe('evaluateReadiness — relative mode (with baseline)', () => {
  it('HRV at 60 % of baseline → red (was green under absolute)', () => {
    // Absolute would put 30 ms as 'moderate' (yellow). With baseline 50 → 60% → red.
    const r = evaluateReadiness({
      todayHrvMs: 30,
      todayRhrBpm: 60,
      todaySleepMinutes: 480,
      baseline: { hrvMeanMs: 50, rhrMeanBpm: 60, sleepMeanMinutes: 450 },
    });
    expect(r.level).toBe('red');
    expect(r.factors.find(f => f.key === 'hrv_low')).toBeDefined();
  });

  it('HRV at 80 % of baseline → yellow', () => {
    const r = evaluateReadiness({
      todayHrvMs: 40,
      todayRhrBpm: 60,
      todaySleepMinutes: 480,
      baseline: { hrvMeanMs: 50, rhrMeanBpm: 60, sleepMeanMinutes: 450 },
    });
    expect(r.level).toBe('yellow');
    expect(r.factors.find(f => f.key === 'hrv_moderate')).toBeDefined();
  });

  it('HRV at 95 % of baseline → green', () => {
    const r = evaluateReadiness({
      todayHrvMs: 47,
      todayRhrBpm: 60,
      todaySleepMinutes: 480,
      baseline: { hrvMeanMs: 50, rhrMeanBpm: 60, sleepMeanMinutes: 450 },
    });
    expect(r.level).toBe('green');
  });

  it('Athlete with low absolute HRV (20 ms) — but stable baseline (20 ms) → green', () => {
    // Without baseline: absolute would call 20 ms red. With baseline matching, it's normal.
    const r = evaluateReadiness({
      todayHrvMs: 20,
      todayRhrBpm: 50,
      todaySleepMinutes: 470,
      baseline: { hrvMeanMs: 20, rhrMeanBpm: 50, sleepMeanMinutes: 460 },
    });
    expect(r.level).toBe('green');
  });

  it('RHR 15 % above baseline → yellow', () => {
    const r = evaluateReadiness({
      todayRhrBpm: 69,
      todayHrvMs: 50,
      todaySleepMinutes: 480,
      baseline: { hrvMeanMs: 50, rhrMeanBpm: 60, sleepMeanMinutes: 450 },
    });
    expect(r.level).toBe('yellow');
    expect(r.factors.find(f => f.key === 'rhr_elevated')).toBeDefined();
  });

  it('RHR 25 % above baseline → red', () => {
    const r = evaluateReadiness({
      todayRhrBpm: 75,
      todayHrvMs: 50,
      todaySleepMinutes: 480,
      baseline: { hrvMeanMs: 50, rhrMeanBpm: 60, sleepMeanMinutes: 450 },
    });
    expect(r.level).toBe('red');
  });

  it('sleep at 60 % of baseline → red', () => {
    const r = evaluateReadiness({
      todaySleepMinutes: 270,
      todayRhrBpm: 60,
      todayHrvMs: 50,
      baseline: { hrvMeanMs: 50, rhrMeanBpm: 60, sleepMeanMinutes: 450 },
    });
    expect(r.level).toBe('red');
  });

  it('partial baseline (only HRV present) falls back to absolute for sleep/RHR', () => {
    // No sleepMeanMinutes baseline → sleep uses absolute thresholds.
    // 300 min sleep should still trip 'sleep_short' absolute red.
    const r = evaluateReadiness({
      todaySleepMinutes: 300,
      todayHrvMs: 50,
      baseline: { hrvMeanMs: 50 },
    });
    expect(r.level).toBe('red');
    expect(r.factors.find(f => f.key === 'sleep_short')).toBeDefined();
  });

  it('baseline messages mention the personal average', () => {
    const r = evaluateReadiness({
      todayHrvMs: 30,
      baseline: { hrvMeanMs: 50 },
    });
    const hrv = r.factors.find(f => f.key === 'hrv_moderate' || f.key === 'hrv_low');
    expect(hrv?.message).toContain('50'); // baseline value visible
    expect(hrv?.message).toMatch(/průměr/i);
  });
});
