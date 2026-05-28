import { afterEach, describe, expect, it } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AsyncStorageTokenStore,
  CompositeHealthDataProvider,
  HealthConnectProvider,
  MockHealthDataProvider,
  StravaProvider,
  WhoopProvider,
  isExpired,
  type HealthDataProvider,
} from '../lib/health';
import { __test__ as StravaInternals } from '../lib/health/StravaProvider';
import type {
  BodyWeightSample,
  DailyActivitySummary,
  HealthPermissionStatus,
  HrvSample,
  RestingHeartRateSample,
  SleepSummary,
  WorkoutSummary,
} from '../types/health';

// ── OAuth token store ────────────────────────────────────────────────────────

describe('AsyncStorageTokenStore', () => {
  afterEach(async () => {
    await AsyncStorageTokenStore.purge();
  });

  it('starts empty', async () => {
    const store = new AsyncStorageTokenStore();
    expect(await store.getToken('strava')).toBeNull();
    expect(await store.listConnected()).toEqual([]);
  });

  it('roundtrips a token', async () => {
    const store = new AsyncStorageTokenStore();
    await store.setToken('strava', { accessToken: 'abc', refreshToken: 'r', expiresAt: '2027-01-01T00:00:00Z' });
    const got = await store.getToken('strava');
    expect(got?.accessToken).toBe('abc');
    expect(got?.refreshToken).toBe('r');
  });

  it('listConnected returns only stored services', async () => {
    const store = new AsyncStorageTokenStore();
    await store.setToken('strava', { accessToken: 'a' });
    await store.setToken('whoop', { accessToken: 'b' });
    const list = await store.listConnected();
    expect(list.sort()).toEqual(['strava', 'whoop']);
  });

  it('clearToken removes one service only', async () => {
    const store = new AsyncStorageTokenStore();
    await store.setToken('strava', { accessToken: 'a' });
    await store.setToken('whoop', { accessToken: 'b' });
    await store.clearToken('strava');
    expect(await store.getToken('strava')).toBeNull();
    expect(await store.getToken('whoop')).not.toBeNull();
  });

  it('purge clears all OAuth keys', async () => {
    const store = new AsyncStorageTokenStore();
    await store.setToken('strava', { accessToken: 'a' });
    await store.setToken('whoop', { accessToken: 'b' });
    await AsyncStorageTokenStore.purge();
    expect(await store.listConnected()).toEqual([]);
  });
});

describe('isExpired', () => {
  it('null expiresAt → never expired', () => {
    expect(isExpired({ accessToken: 'a' })).toBe(false);
  });
  it('past expiresAt → expired', () => {
    expect(isExpired({ accessToken: 'a', expiresAt: '2020-01-01T00:00:00Z' })).toBe(true);
  });
  it('future expiresAt → not expired', () => {
    const future = new Date(Date.now() + 60 * 60_000).toISOString();
    expect(isExpired({ accessToken: 'a', expiresAt: future })).toBe(false);
  });
  it('within skew window → expired', () => {
    const inThirtySeconds = new Date(Date.now() + 30_000).toISOString();
    expect(isExpired({ accessToken: 'a', expiresAt: inThirtySeconds }, 60)).toBe(true);
  });
});

// ── Strava provider ──────────────────────────────────────────────────────────

describe('StravaProvider', () => {
  afterEach(async () => {
    await AsyncStorageTokenStore.purge();
  });

  it('without token → not available, no data', async () => {
    const store = new AsyncStorageTokenStore();
    const p = new StravaProvider(store);
    expect(await p.isAvailable()).toBe(false);
    expect(await p.getPermissionStatus()).toBe('not_determined');
    expect(await p.getWorkoutSummaries(new Date('2026-01-01'), new Date('2026-01-31'))).toEqual([]);
  });

  it('with token → granted permission, available', async () => {
    const store = new AsyncStorageTokenStore();
    await store.setToken('strava', { accessToken: 'x', expiresAt: '2099-01-01T00:00:00Z' });
    const p = new StravaProvider(store);
    expect(await p.isAvailable()).toBe(true);
    expect(await p.getPermissionStatus()).toBe('granted');
  });

  it('only exposes workouts — sleep / RHR / HRV / weight always null', async () => {
    const store = new AsyncStorageTokenStore();
    await store.setToken('strava', { accessToken: 'x' });
    const p = new StravaProvider(store);
    expect(await p.getDailyActivityRange(new Date(), new Date())).toEqual([]);
    expect(await p.getSleepSummary(new Date(), new Date())).toEqual([]);
    expect(await p.getRestingHeartRate(new Date())).toBeNull();
    expect(await p.getHrv(new Date())).toBeNull();
    expect(await p.getLatestBodyWeight()).toBeNull();
  });
});

describe('Strava mapActivity', () => {
  it('maps run with HR + distance', () => {
    const m = StravaInternals.mapActivity({
      id: 123456789,
      name: 'Morning Run',
      type: 'Run',
      start_date: '2026-05-27T05:30:00Z',
      start_date_local: '2026-05-27T07:30:00',
      elapsed_time: 2700,
      moving_time: 2640,
      distance: 8000,
      average_heartrate: 152,
      max_heartrate: 178,
      calories: 540,
    });
    expect(m.kind).toBe('run');
    expect(m.externalId).toBe('123456789');
    expect(m.source).toBe('strava');
    expect(m.distanceKm).toBe(8);
    expect(m.durationMinutes).toBe(44);
    expect(m.avgPaceSecPerKm).toBe(330); // 2640 / 8
    expect(m.avgHeartRate).toBe(152);
    expect(m.activeEnergyKcal).toBe(540);
  });

  it('maps unknown activity type to "other"', () => {
    expect(StravaInternals.mapType('Pickleball')).toBe('other');
  });

  it('maps several common types', () => {
    expect(StravaInternals.mapType('Ride')).toBe('cycle');
    expect(StravaInternals.mapType('Swim')).toBe('swim');
    expect(StravaInternals.mapType('Walk')).toBe('walk');
    expect(StravaInternals.mapType('WeightTraining')).toBe('strength');
    expect(StravaInternals.mapType('Yoga')).toBe('yoga');
    expect(StravaInternals.mapType('Rowing')).toBe('rowing');
  });
});

// ── Whoop / HealthConnect stubs ──────────────────────────────────────────────

describe('WhoopProvider — stub behavior without OAuth flow', () => {
  it('without token → not available', async () => {
    const store = new AsyncStorageTokenStore();
    const p = new WhoopProvider(store);
    expect(await p.isAvailable()).toBe(false);
    expect(await p.getSleepSummary(new Date(), new Date())).toEqual([]);
    expect(await p.getRestingHeartRate(new Date())).toBeNull();
    expect(await p.getHrv(new Date())).toBeNull();
  });

  it('with token → granted permission (read-side stubs return empty until impl)', async () => {
    const store = new AsyncStorageTokenStore();
    await store.setToken('whoop', { accessToken: 'x' });
    const p = new WhoopProvider(store);
    expect(await p.isAvailable()).toBe(true);
    expect(await p.getPermissionStatus()).toBe('granted');
  });
});

describe('HealthConnectProvider — Android stub', () => {
  it('all reads empty / unavailable until native plugin lands', async () => {
    const p = new HealthConnectProvider();
    expect(await p.isAvailable()).toBe(false);
    expect(await p.getPermissionStatus()).toBe('unavailable');
    expect(await p.getDailyActivityRange(new Date(), new Date())).toEqual([]);
    expect(await p.getWorkoutSummaries(new Date(), new Date())).toEqual([]);
    expect(await p.getSleepSummary(new Date(), new Date())).toEqual([]);
    expect(await p.getRestingHeartRate(new Date())).toBeNull();
    expect(await p.getHrv(new Date())).toBeNull();
    expect(await p.getLatestBodyWeight()).toBeNull();
  });
});

// ── Composite provider ──────────────────────────────────────────────────────

class FakeProvider implements HealthDataProvider {
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
      throwOn?: keyof FakeProvider;
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
  async getSleepSummary() { return this.opts.sleep ?? []; }
  async getRestingHeartRate() { return this.opts.rhr ?? null; }
  async getHrv() { return this.opts.hrv ?? null; }
}

describe('CompositeHealthDataProvider', () => {
  it('priority pick: first provider wins for single-value queries', async () => {
    const high = new FakeProvider({ weight: { date: '2026-05-27', weightKg: 80, source: 'apple_health' } });
    const low = new FakeProvider({ weight: { date: '2026-05-27', weightKg: 78, source: 'manual' } });
    const composite = new CompositeHealthDataProvider([high, low]);
    const w = await composite.getLatestBodyWeight();
    expect(w?.weightKg).toBe(80);
  });

  it('falls back to next provider if first has nothing', async () => {
    const empty = new FakeProvider({ weight: null });
    const has = new FakeProvider({ weight: { date: '2026-05-27', weightKg: 80, source: 'manual' } });
    const composite = new CompositeHealthDataProvider([empty, has]);
    expect((await composite.getLatestBodyWeight())?.weightKg).toBe(80);
  });

  it('dedups workouts by externalId across sources', async () => {
    // Same run synced to both Apple Health AND Strava — externalId differs
    // per source so we can't dedup on that alone; composite uses fuzzy time match.
    const appleHealth = new FakeProvider({
      workouts: [{
        id: 'apple-1', externalId: 'apple-1',
        startedAt: '2026-05-27T05:30:00Z', endedAt: '2026-05-27T06:00:00Z',
        kind: 'run', durationMinutes: 30, source: 'apple_health',
      }],
    });
    const strava = new FakeProvider({
      workouts: [{
        id: 'strava-99', externalId: 'strava-99',
        startedAt: '2026-05-27T05:30:30Z', endedAt: '2026-05-27T06:00:30Z', // 30 s offset
        kind: 'run', durationMinutes: 30, source: 'strava',
      }],
    });
    const composite = new CompositeHealthDataProvider([appleHealth, strava]);
    const all = await composite.getWorkoutSummaries(new Date('2026-05-27'), new Date('2026-05-27'));
    expect(all.length).toBe(1);
    expect(all[0].source).toBe('apple_health'); // higher priority wins
  });

  it('keeps distinct workouts from different sources', async () => {
    const apple = new FakeProvider({
      workouts: [{ id: 'a', externalId: 'a', startedAt: '2026-05-27T05:00:00Z', endedAt: '2026-05-27T06:00:00Z', kind: 'run', durationMinutes: 60, source: 'apple_health' }],
    });
    const strava = new FakeProvider({
      workouts: [{ id: 'b', externalId: 'b', startedAt: '2026-05-27T18:00:00Z', endedAt: '2026-05-27T18:30:00Z', kind: 'cycle', durationMinutes: 30, source: 'strava' }],
    });
    const composite = new CompositeHealthDataProvider([apple, strava]);
    const all = await composite.getWorkoutSummaries(new Date('2026-05-27'), new Date('2026-05-27'));
    expect(all.length).toBe(2);
  });

  it('one provider throwing does not break the whole query', async () => {
    const broken = new FakeProvider({ throwOn: 'getWorkoutSummaries' });
    const ok = new FakeProvider({
      workouts: [{ id: 'b', externalId: 'b', startedAt: '2026-05-27T18:00:00Z', endedAt: '2026-05-27T18:30:00Z', kind: 'run', durationMinutes: 30, source: 'strava' }],
    });
    const composite = new CompositeHealthDataProvider([broken, ok]);
    const all = await composite.getWorkoutSummaries(new Date('2026-05-27'), new Date('2026-05-27'));
    expect(all.length).toBe(1);
  });

  it('permission status: granted + denied = partial', async () => {
    const granted = new FakeProvider({ permission: 'granted' });
    const denied = new FakeProvider({ permission: 'denied' });
    const composite = new CompositeHealthDataProvider([granted, denied]);
    expect(await composite.getPermissionStatus()).toBe('partial');
  });

  it('permission status: all granted → granted', async () => {
    const a = new FakeProvider({ permission: 'granted' });
    const b = new FakeProvider({ permission: 'granted' });
    expect(await new CompositeHealthDataProvider([a, b]).getPermissionStatus()).toBe('granted');
  });

  it('isAvailable true if any source is available', async () => {
    const off = new FakeProvider({ available: false });
    const on = new FakeProvider({ available: true });
    const composite = new CompositeHealthDataProvider([off, on]);
    expect(await composite.isAvailable()).toBe(true);
  });

  it('isAvailable false if no source is available', async () => {
    const off1 = new FakeProvider({ available: false });
    const off2 = new FakeProvider({ available: false });
    expect(await new CompositeHealthDataProvider([off1, off2]).isAvailable()).toBe(false);
  });

  it('Mock + Strava together produces workouts from Strava + steps from Mock', async () => {
    const mock = new MockHealthDataProvider({ seed: 1 });
    const strava = new FakeProvider({
      workouts: [{ id: 'strava-7', externalId: 'strava-7', startedAt: '2026-05-27T17:00:00Z', endedAt: '2026-05-27T18:00:00Z', kind: 'run', durationMinutes: 60, source: 'strava' }],
    });
    // Order: Strava first (so its workouts win over Mock's seeded workouts);
    // Mock provides steps + sleep + HRV
    const composite = new CompositeHealthDataProvider([strava, mock]);
    const activity = await composite.getDailyActivityRange(new Date('2026-05-27'), new Date('2026-05-27'));
    expect(activity.length).toBe(1);
    expect(activity[0].steps).toBeGreaterThan(0); // from Mock
    const sleep = await composite.getSleepSummary(new Date('2026-05-27'), new Date('2026-05-27'));
    expect(sleep[0].totalMinutes).toBeGreaterThan(0); // from Mock
  });
});
