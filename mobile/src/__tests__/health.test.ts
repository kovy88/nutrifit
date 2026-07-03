import { afterEach, describe, expect, it } from 'vitest';
import {
  createHealthDataProvider,
  ManualHealthDataProvider,
  MockHealthDataProvider,
} from '../lib/health';
import type {
  DailyActivitySummary,
  HrvSample,
  RestingHeartRateSample,
  SleepSummary,
  WorkoutSummary,
} from '../types/health';

describe('MockHealthDataProvider', () => {
  it('is always available', async () => {
    const p = new MockHealthDataProvider();
    expect(await p.isAvailable()).toBe(true);
    expect(await p.getPermissionStatus()).toBe('granted');
  });

  it('returns deterministic activity for same seed', async () => {
    const a = new MockHealthDataProvider({ seed: 100 });
    const b = new MockHealthDataProvider({ seed: 100 });
    const start = new Date('2026-01-01');
    const end = new Date('2026-01-07');
    const sa = await a.getDailyActivityRange(start, end);
    const sb = await b.getDailyActivityRange(start, end);
    expect(sa).toEqual(sb);
    expect(sa.length).toBe(7);
  });

  it('returns different data for different seeds', async () => {
    const a = await new MockHealthDataProvider({ seed: 1 }).getDailyActivityRange(new Date('2026-01-01'), new Date('2026-01-01'));
    const b = await new MockHealthDataProvider({ seed: 2 }).getDailyActivityRange(new Date('2026-01-01'), new Date('2026-01-01'));
    expect(a[0].steps).not.toBe(b[0].steps);
  });

  it('steps fall in realistic range 3k–15k', async () => {
    const p = new MockHealthDataProvider({ seed: 7 });
    const range = await p.getDailyActivityRange(new Date('2026-01-01'), new Date('2026-01-30'));
    for (const d of range) {
      expect(d.steps).toBeGreaterThanOrEqual(3000);
      expect(d.steps).toBeLessThanOrEqual(15000);
      expect(d.source).toBe('mock');
    }
  });

  it('returns ~3 workouts per week, all source=mock', async () => {
    const p = new MockHealthDataProvider({ seed: 42 });
    const workouts = await p.getWorkoutSummaries(new Date('2026-01-01'), new Date('2026-01-14'));
    expect(workouts.length).toBeGreaterThanOrEqual(4);
    expect(workouts.length).toBeLessThanOrEqual(10);
    for (const w of workouts) {
      expect(w.source).toBe('mock');
      expect(w.durationMinutes).toBeGreaterThan(0);
    }
  });

  it('latest body weight is within ±1 kg of configured weight', async () => {
    const p = new MockHealthDataProvider({ seed: 5, weightKg: 80 });
    const w = await p.getLatestBodyWeight();
    expect(w).not.toBeNull();
    expect(Math.abs(w!.weightKg - 80)).toBeLessThan(1);
  });

  it('sleep totalMinutes in 6–9 h range', async () => {
    const p = new MockHealthDataProvider({ seed: 11 });
    const sleep = await p.getSleepSummary(new Date('2026-01-01'), new Date('2026-01-07'));
    for (const s of sleep) {
      expect(s.totalMinutes).toBeGreaterThanOrEqual(360);
      expect(s.totalMinutes).toBeLessThanOrEqual(540);
    }
  });

  it('RHR is plausible (50–75 bpm)', async () => {
    const p = new MockHealthDataProvider({ seed: 13 });
    const r = await p.getRestingHeartRate(new Date('2026-01-01'));
    expect(r).not.toBeNull();
    expect(r!.bpm).toBeGreaterThanOrEqual(50);
    expect(r!.bpm).toBeLessThanOrEqual(75);
  });

  it('HRV is plausible (25–65 ms SDNN)', async () => {
    const p = new MockHealthDataProvider({ seed: 13 });
    const h = await p.getHrv(new Date('2026-01-01'));
    expect(h).not.toBeNull();
    expect(h!.ms).toBeGreaterThanOrEqual(25);
    expect(h!.ms).toBeLessThanOrEqual(65);
    expect(h!.metric).toBe('sdnn');
  });

  it('respects permissionStatus override', async () => {
    const p = new MockHealthDataProvider({ permissionStatus: 'denied' });
    expect(await p.getPermissionStatus()).toBe('denied');
    const res = await p.requestPermissions(['steps', 'heartRate']);
    expect(res.status).toBe('denied');
    expect(res.granted).toEqual([]);
    expect(res.denied).toEqual(['steps', 'heartRate']);
  });
});

describe('ManualHealthDataProvider', () => {
  afterEach(async () => {
    await ManualHealthDataProvider.purge();
  });

  it('returns empty when nothing recorded', async () => {
    const p = new ManualHealthDataProvider();
    const range = await p.getDailyActivityRange(new Date('2026-01-01'), new Date('2026-01-07'));
    expect(range).toEqual([]);
    expect(await p.getLatestBodyWeight()).toBeNull();
    expect(await p.getRestingHeartRate(new Date('2026-01-01'))).toBeNull();
  });

  it('recordActivity → getDailyActivityRange roundtrip', async () => {
    const p = new ManualHealthDataProvider();
    const summary: DailyActivitySummary = {
      date: '2026-01-15',
      steps: 8200,
      activeEnergyKcal: 320,
      source: 'manual',
    };
    await p.recordActivity(summary);
    const range = await p.getDailyActivityRange(new Date('2026-01-10'), new Date('2026-01-20'));
    expect(range).toEqual([summary]);
  });

  it('recordWorkout dedupes by id', async () => {
    const p = new ManualHealthDataProvider();
    const w: WorkoutSummary = {
      id: 'w-1',
      startedAt: '2026-01-15T17:00:00.000',
      endedAt: '2026-01-15T17:45:00.000',
      kind: 'run',
      durationMinutes: 45,
      distanceKm: 7,
      source: 'manual',
    };
    await p.recordWorkout(w);
    await p.recordWorkout({ ...w, durationMinutes: 50 }); // same id, updated duration
    const all = await p.getWorkoutSummaries(new Date('2026-01-01'), new Date('2026-01-31'));
    expect(all.length).toBe(1);
    expect(all[0].durationMinutes).toBe(50);
  });

  it('weight history keeps sorted, returns most recent', async () => {
    const p = new ManualHealthDataProvider();
    await p.recordWeight({ date: '2026-01-10', weightKg: 80, source: 'manual' });
    await p.recordWeight({ date: '2026-01-05', weightKg: 81, source: 'manual' });
    await p.recordWeight({ date: '2026-01-15', weightKg: 79.5, source: 'manual' });
    const latest = await p.getLatestBodyWeight(365);
    expect(latest?.weightKg).toBe(79.5);
    expect(latest?.date).toBe('2026-01-15');
  });

  it('latest weight respects maxDaysOld', async () => {
    const p = new ManualHealthDataProvider();
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 60);
    const oldKey = `${oldDate.getFullYear()}-${String(oldDate.getMonth() + 1).padStart(2, '0')}-${String(oldDate.getDate()).padStart(2, '0')}`;
    await p.recordWeight({ date: oldKey, weightKg: 80, source: 'manual' });
    expect(await p.getLatestBodyWeight(30)).toBeNull();
    expect(await p.getLatestBodyWeight(90)).not.toBeNull();
  });

  it('purge clears all manual.* keys', async () => {
    const p = new ManualHealthDataProvider();
    await p.recordActivity({ date: '2026-01-01', steps: 5000, activeEnergyKcal: 200, source: 'manual' });
    await p.recordWeight({ date: '2026-01-01', weightKg: 75, source: 'manual' });
    await ManualHealthDataProvider.purge();
    expect(await p.getLatestBodyWeight()).toBeNull();
    const range = await p.getDailyActivityRange(new Date('2026-01-01'), new Date('2026-01-01'));
    expect(range).toEqual([]);
  });

  it('roundtrips sleep / RHR / HRV', async () => {
    const p = new ManualHealthDataProvider();
    const sleep: SleepSummary = { date: '2026-01-15', totalMinutes: 440, source: 'manual' };
    const rhr: RestingHeartRateSample = { date: '2026-01-15', bpm: 58, source: 'manual' };
    const hrv: HrvSample = { date: '2026-01-15', ms: 52, metric: 'sdnn', source: 'manual' };
    await p.recordSleep(sleep);
    await p.recordRestingHeartRate(rhr);
    await p.recordHrv(hrv);
    expect((await p.getSleepSummary(new Date('2026-01-15'), new Date('2026-01-15')))[0]).toEqual(sleep);
    expect(await p.getRestingHeartRate(new Date('2026-01-15'))).toEqual(rhr);
    expect(await p.getHrv(new Date('2026-01-15'))).toEqual(hrv);
  });
});

describe('createHealthDataProvider factory', () => {
  it('mode=mock returns MockHealthDataProvider', () => {
    const p = createHealthDataProvider({ mode: 'mock' });
    expect(p.name).toBe('mock');
  });

  it('mode=manual returns ManualHealthDataProvider', () => {
    const p = createHealthDataProvider({ mode: 'manual' });
    expect(p.name).toBe('manual');
  });

  it('mode=apple_health returns AppleHealthProvider (stub)', async () => {
    const p = createHealthDataProvider({ mode: 'apple_health' });
    expect(p.name).toBe('apple_health');
    // stub: isAvailable returns false until native plugin is installed
    expect(await p.isAvailable()).toBe(false);
    expect(await p.getPermissionStatus()).toBe('unavailable');
  });

  it('mode=auto returns a valid provider (typically composite)', () => {
    const p = createHealthDataProvider({ mode: 'auto' });
    // auto mode now returns CompositeHealthDataProvider wrapping platform-native
    // + OAuth providers + a fallback (Mock in dev, Manual in prod).
    expect(['composite', 'mock', 'manual', 'apple_health', 'health_connect']).toContain(p.name);
  });
});
