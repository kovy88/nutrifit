import { afterEach, describe, expect, it } from 'vitest';
import {
  MockHealthDataProvider,
  ManualHealthDataProvider,
  CompositeHealthDataProvider,
  AppleHealthProvider,
  HealthConnectProvider,
} from '../lib/health';
import type { HealthDataProvider } from '../lib/health';
import type {
  BodyWeightSample,
  DailyActivitySummary,
  HealthPermissionStatus,
  HrvSample,
  RestingHeartRateSample,
  SleepSummary,
  WorkoutSummary,
} from '../types/health';

afterEach(async () => {
  await ManualHealthDataProvider.purge();
});

describe('MockHealthDataProvider', () => {
  it('generates deterministic activity, sleep, and workouts with same seed', async () => {
    const p1 = new MockHealthDataProvider({ seed: 42 });
    const p2 = new MockHealthDataProvider({ seed: 42 });

    const start = new Date('2026-05-20');
    const end = new Date('2026-05-25');

    const act1 = await p1.getDailyActivityRange(start, end);
    const act2 = await p2.getDailyActivityRange(start, end);
    expect(act1).toEqual(act2);
    expect(act1.length).toBe(6);
    expect(act1[0].steps).toBeGreaterThanOrEqual(5000);

    const sleep1 = await p1.getSleepSummary(start, end);
    const sleep2 = await p2.getSleepSummary(start, end);
    expect(sleep1).toEqual(sleep2);
    expect(sleep1.length).toBe(6);
    expect(sleep1[0].totalMinutes).toBeGreaterThanOrEqual(300);

    const recovery1 = await p1.getRecoveryInputs(start, end);
    const recovery2 = await p2.getRecoveryInputs(start, end);
    expect(recovery1).toEqual(recovery2);
    expect(recovery1.length).toBe(6);
    expect(recovery1[0].todaySleepMinutes).not.toBeNull();
    expect(recovery1[0].todayRhrBpm).not.toBeNull();
    expect(recovery1[0].todayHrvMs).not.toBeNull();
  });

  it('generates different data with different seeds', async () => {
    const p1 = new MockHealthDataProvider({ seed: 42 });
    const p2 = new MockHealthDataProvider({ seed: 99 });

    const start = new Date('2026-05-20');
    const end = new Date('2026-05-25');

    const act1 = await p1.getDailyActivityRange(start, end);
    const act2 = await p2.getDailyActivityRange(start, end);
    expect(act1).not.toEqual(act2);
  });
});

describe('ManualHealthDataProvider', () => {
  it('starts empty and returns empty arrays/nulls', async () => {
    const p = new ManualHealthDataProvider();
    const start = new Date('2026-05-20');
    const end = new Date('2026-05-25');

    expect(await p.getDailyActivityRange(start, end)).toEqual([]);
    expect(await p.getWorkoutSummaries(start, end)).toEqual([]);
    expect(await p.getLatestBodyWeight()).toBeNull();
    expect(await p.getBodyWeightRange(start, end)).toEqual([]);
    expect(await p.getSleepSummary(start, end)).toEqual([]);
    
    const recoveries = await p.getRecoveryInputs(start, end);
    expect(recoveries.length).toBe(6);
    for (const rec of recoveries) {
      expect(rec.todaySleepMinutes).toBeNull();
      expect(rec.todayRhrBpm).toBeNull();
      expect(rec.todayHrvMs).toBeNull();
    }
  });

  it('records and retrieves sleep, rhr, hrv and recovery inputs correctly', async () => {
    const p = new ManualHealthDataProvider();
    const dateStr = '2026-05-22';
    const date = new Date(dateStr);

    await p.recordSleep({
      date: dateStr,
      totalMinutes: 480,
      deepMinutes: 90,
      remMinutes: 90,
      awakeMinutes: 10,
      efficiency: 0.95,
      source: 'manual',
    });

    await p.recordRestingHeartRate({
      date: dateStr,
      bpm: 62,
      source: 'manual',
    });

    await p.recordHrv({
      date: dateStr,
      ms: 55,
      metric: 'sdnn',
      source: 'manual',
    });

    const sleep = await p.getSleepSummary(date, date);
    expect(sleep.length).toBe(1);
    expect(sleep[0].totalMinutes).toBe(480);

    const rhr = await p.getRestingHeartRate(date);
    expect(rhr?.bpm).toBe(62);

    const hrv = await p.getHrv(date);
    expect(hrv?.ms).toBe(55);

    const recoveries = await p.getRecoveryInputs(date, date);
    expect(recoveries.length).toBe(1);
    expect(recoveries[0].todaySleepMinutes).toBe(480);
    expect(recoveries[0].todayRhrBpm).toBe(62);
    expect(recoveries[0].todayHrvMs).toBe(55);
  });

  it('purges all keys properly', async () => {
    const p = new ManualHealthDataProvider();
    const dateStr = '2026-05-22';
    const date = new Date(dateStr);

    await p.recordSleep({ date: dateStr, totalMinutes: 480, source: 'manual' });
    expect((await p.getSleepSummary(date, date)).length).toBe(1);

    await ManualHealthDataProvider.purge();
    expect((await p.getSleepSummary(date, date)).length).toBe(0);
  });
});

class TestFakeProvider implements HealthDataProvider {
  readonly name = 'mock' as const;
  constructor(
    private opts: {
      available?: boolean;
      permission?: HealthPermissionStatus;
      activity?: DailyActivitySummary[];
      workouts?: WorkoutSummary[];
      sleep?: SleepSummary[];
      weight?: BodyWeightSample | null;
      rhr?: RestingHeartRateSample | null;
      hrv?: HrvSample | null;
      recoveries?: any[];
      throwOn?: string;
    } = {},
  ) {}
  async isAvailable() {
    if (this.opts.throwOn === 'isAvailable') throw new Error('boom');
    return this.opts.available ?? true;
  }
  async getPermissionStatus() { return this.opts.permission ?? 'granted'; }
  async requestPermissions(types: any) { return { status: 'granted' as const, granted: types, denied: [] }; }
  async getDailyActivityRange() {
    if (this.opts.throwOn === 'getDailyActivityRange') throw new Error('boom');
    return this.opts.activity ?? [];
  }
  async getWorkoutSummaries() {
    if (this.opts.throwOn === 'getWorkoutSummaries') throw new Error('boom');
    return this.opts.workouts ?? [];
  }
  async getLatestBodyWeight() { return this.opts.weight ?? null; }
  async getBodyWeightRange() { return this.opts.weight ? [this.opts.weight] : []; }
  async getSleepSummary() { return this.opts.sleep ?? []; }
  async getRestingHeartRate() { return this.opts.rhr ?? null; }
  async getHrv() { return this.opts.hrv ?? null; }
  async getRecoveryInputs(start: Date, end: Date) {
    if (this.opts.throwOn === 'getRecoveryInputs') throw new Error('boom');
    return this.opts.recoveries ?? [];
  }
}

describe('CompositeHealthDataProvider', () => {
  it('merges getRecoveryInputs from multiple providers prioritize by order', async () => {
    const dateStr = '2026-05-22';
    const start = new Date(dateStr);
    const end = new Date(dateStr);

    const high = new TestFakeProvider({
      recoveries: [{
        date: dateStr,
        todaySleepMinutes: 500,
        todayRhrBpm: 58,
        todayHrvMs: 65,
      }],
    });

    const low = new TestFakeProvider({
      recoveries: [{
        date: dateStr,
        todaySleepMinutes: 400,
        todayRhrBpm: 65,
        todayHrvMs: 45,
      }],
    });

    const composite = new CompositeHealthDataProvider([high, low]);
    const res = await composite.getRecoveryInputs(start, end);
    expect(res.length).toBe(1);
    expect(res[0].todaySleepMinutes).toBe(500); // high wins
    expect(res[0].todayRhrBpm).toBe(58);
    expect(res[0].todayHrvMs).toBe(65);
  });

  it('merges sparse recoveries correctly', async () => {
    const d1 = '2026-05-22';
    const d2 = '2026-05-23';
    const start = new Date(d1);
    const end = new Date(d2);

    const high = new TestFakeProvider({
      recoveries: [
        { date: d1, todaySleepMinutes: 500, todayRhrBpm: null, todayHrvMs: null },
      ],
    });

    const low = new TestFakeProvider({
      recoveries: [
        { date: d1, todaySleepMinutes: 400, todayRhrBpm: 60, todayHrvMs: 50 },
        { date: d2, todaySleepMinutes: 480, todayRhrBpm: 62, todayHrvMs: 52 },
      ],
    });

    const composite = new CompositeHealthDataProvider([high, low]);
    const res = await composite.getRecoveryInputs(start, end);
    expect(res.length).toBe(2);

    const r1 = res.find(r => r.date === d1);
    const r2 = res.find(r => r.date === d2);

    expect(r1?.todaySleepMinutes).toBe(500); // high wins
    expect(r1?.todayRhrBpm).toBe(60);        // low falls back
    expect(r1?.todayHrvMs).toBe(50);         // low falls back

    expect(r2?.todaySleepMinutes).toBe(480);
    expect(r2?.todayRhrBpm).toBe(62);
    expect(r2?.todayHrvMs).toBe(52);
  });

  it('handles broken provider gracefully in getRecoveryInputs', async () => {
    const dateStr = '2026-05-22';
    const start = new Date(dateStr);
    const end = new Date(dateStr);

    const broken = new TestFakeProvider({ throwOn: 'getRecoveryInputs' });
    const ok = new TestFakeProvider({
      recoveries: [{
        date: dateStr,
        todaySleepMinutes: 480,
      }],
    });

    const composite = new CompositeHealthDataProvider([broken, ok]);
    const res = await composite.getRecoveryInputs(start, end);
    expect(res.length).toBe(1);
    expect(res[0].todaySleepMinutes).toBe(480);
  });
});

describe('Native Providers Placeholder Availability', () => {
  it('AppleHealthProvider handles simulated unavailable environment', async () => {
    const p = new AppleHealthProvider();
    // In simulator / non-iOS or test environment, should be unavailable
    expect(await p.isAvailable()).toBe(false);
    expect(await p.getPermissionStatus()).toBe('unavailable');
    
    const start = new Date('2026-05-20');
    const end = new Date('2026-05-22');
    expect(await p.getRecoveryInputs(start, end)).toEqual([]);
  });

  it('HealthConnectProvider handles simulated unavailable environment', async () => {
    const p = new HealthConnectProvider();
    expect(await p.isAvailable()).toBe(false);
    expect(await p.getPermissionStatus()).toBe('unavailable');
    
    const start = new Date('2026-05-20');
    const end = new Date('2026-05-22');
    expect(await p.getRecoveryInputs(start, end)).toEqual([]);
  });
});
