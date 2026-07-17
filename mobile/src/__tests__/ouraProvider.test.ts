import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AsyncStorageTokenStore } from '../lib/health';
import { OuraProvider } from '../lib/health/OuraProvider';

describe('OuraProvider — token handling', () => {
  let store: AsyncStorageTokenStore;
  let provider: OuraProvider;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    store = new AsyncStorageTokenStore();
    provider = new OuraProvider(store);
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(async () => {
    await AsyncStorageTokenStore.purge();
    vi.restoreAllMocks();
  });

  it('returns empty results with no token stored, without ever calling fetch', async () => {
    expect(await provider.getSleepSummary(new Date('2026-05-01'), new Date('2026-05-07'))).toEqual([]);
    expect(await provider.getDailyActivityRange(new Date('2026-05-01'), new Date('2026-05-07'))).toEqual([]);
    expect(await provider.getWorkoutSummaries(new Date('2026-05-01'), new Date('2026-05-07'))).toEqual([]);
    expect(await provider.getRecoveryInputs(new Date('2026-05-01'), new Date('2026-05-07'))).toEqual([]);
    expect(await provider.getLatestBodyWeight()).toBeNull();
    expect(await provider.getRestingHeartRate(new Date('2026-05-01'))).toBeNull();
    expect(await provider.getHrv(new Date('2026-05-01'))).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('isAvailable reflects whether a token is stored', async () => {
    expect(await provider.isAvailable()).toBe(false);
    await store.setToken('oura', { accessToken: 'X' });
    expect(await provider.isAvailable()).toBe(true);
  });

  it('fetches with a valid (non-expired) token, no refresh attempted', async () => {
    await store.setToken('oura', { accessToken: 'VALID', expiresAt: '2099-01-01T00:00:00Z' });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [], next_token: null }) });

    await provider.getSleepSummary(new Date('2026-05-01'), new Date('2026-05-07'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/sleep');
    expect(options.headers.Authorization).toBe('Bearer VALID');
  });

  it('refreshes an expired token before fetching, then uses the new access token', async () => {
    await store.setToken('oura', {
      accessToken: 'OLD',
      refreshToken: 'REFRESH_TOKEN',
      expiresAt: '2020-01-01T00:00:00Z',
    });
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accessToken: 'REFRESHED', refreshToken: 'NEW_REFRESH', expiresAt: '2099-01-01T00:00:00Z' }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [], next_token: null }) });

    await provider.getSleepSummary(new Date('2026-05-01'), new Date('2026-05-07'));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('/api/oura/refresh');
    const [sleepUrl, sleepOptions] = fetchMock.mock.calls[1];
    expect(sleepUrl).toContain('/sleep');
    expect(sleepOptions.headers.Authorization).toBe('Bearer REFRESHED');

    const stored = await store.getToken('oura');
    expect(stored?.accessToken).toBe('REFRESHED');
  });

  it('returns empty without hitting the Oura API when refresh fails', async () => {
    await store.setToken('oura', {
      accessToken: 'OLD',
      refreshToken: 'REFRESH_TOKEN',
      expiresAt: '2020-01-01T00:00:00Z',
    });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: 'invalid_grant' }) });

    const result = await provider.getSleepSummary(new Date('2026-05-01'), new Date('2026-05-07'));

    expect(result).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fetches directly (no refresh) when token is expired but has no refreshToken', async () => {
    await store.setToken('oura', { accessToken: 'OLD', expiresAt: '2020-01-01T00:00:00Z' });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [], next_token: null }) });

    await provider.getSleepSummary(new Date('2026-05-01'), new Date('2026-05-07'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/sleep');
  });
});

describe('OuraProvider — data mapping', () => {
  let store: AsyncStorageTokenStore;
  let provider: OuraProvider;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    store = new AsyncStorageTokenStore();
    provider = new OuraProvider(store);
    await store.setToken('oura', { accessToken: 'VALID', expiresAt: '2099-01-01T00:00:00Z' });
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(async () => {
    await AsyncStorageTokenStore.purge();
    vi.restoreAllMocks();
  });

  it('maps a sleep record to SleepSummary, converting seconds to minutes and efficiency to 0..1', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{
          day: '2026-05-01',
          total_sleep_duration: 27000, // 7.5h
          deep_sleep_duration: 5400,   // 1.5h
          rem_sleep_duration: 5400,
          awake_time: 1800,
          efficiency: 92,
          average_hrv: 45,
          lowest_heart_rate: 52,
          type: 'long_sleep',
        }],
        next_token: null,
      }),
    });

    const [summary] = await provider.getSleepSummary(new Date('2026-05-01'), new Date('2026-05-02'));

    expect(summary.date).toBe('2026-05-01');
    expect(summary.totalMinutes).toBe(450);
    expect(summary.deepMinutes).toBe(90);
    expect(summary.remMinutes).toBe(90);
    expect(summary.awakeMinutes).toBe(30);
    expect(summary.efficiency).toBeCloseTo(0.92);
    expect(summary.source).toBe('oura');
  });

  it('prefers the long_sleep record over a nap when both exist for the same day', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { day: '2026-05-01', total_sleep_duration: 1800, type: 'sleep' }, // 30-min nap
          { day: '2026-05-01', total_sleep_duration: 27000, type: 'long_sleep' },
        ],
        next_token: null,
      }),
    });

    const [summary] = await provider.getSleepSummary(new Date('2026-05-01'), new Date('2026-05-02'));
    expect(summary.totalMinutes).toBe(450);
  });

  it('falls back to the longest entry when no record is tagged long_sleep', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { day: '2026-05-01', total_sleep_duration: 1800, type: 'sleep' },
          { day: '2026-05-01', total_sleep_duration: 3600, type: 'sleep' },
        ],
        next_token: null,
      }),
    });

    const [summary] = await provider.getSleepSummary(new Date('2026-05-01'), new Date('2026-05-02'));
    expect(summary.totalMinutes).toBe(60);
  });

  it('getHrv reports metric rmssd from average_hrv', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ day: '2026-05-01', total_sleep_duration: 27000, average_hrv: 48, type: 'long_sleep' }],
        next_token: null,
      }),
    });

    const hrv = await provider.getHrv(new Date('2026-05-01'));
    expect(hrv).toEqual({ date: '2026-05-01', ms: 48, metric: 'rmssd', source: 'oura' });
  });

  it('getRestingHeartRate reads lowest_heart_rate', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ day: '2026-05-01', total_sleep_duration: 27000, lowest_heart_rate: 51, type: 'long_sleep' }],
        next_token: null,
      }),
    });

    const rhr = await provider.getRestingHeartRate(new Date('2026-05-01'));
    expect(rhr).toEqual({ date: '2026-05-01', bpm: 51, source: 'oura' });
  });

  it('maps daily_activity records to DailyActivitySummary', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ day: '2026-05-01', steps: 8421, active_calories: 412, high_activity_time: 600, medium_activity_time: 1200 }],
        next_token: null,
      }),
    });

    const [activity] = await provider.getDailyActivityRange(new Date('2026-05-01'), new Date('2026-05-02'));
    expect(activity.date).toBe('2026-05-01');
    expect(activity.steps).toBe(8421);
    expect(activity.activeEnergyKcal).toBe(412);
    expect(activity.exerciseMinutes).toBe(30); // (600+1200)/60
    expect(activity.source).toBe('oura');
  });

  it('maps workout records, computing duration and mapping known activity strings to WorkoutKind', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{
          id: 'abc123',
          activity: 'running',
          calories: 320,
          distance: 5230,
          start_datetime: '2026-05-01T07:00:00+00:00',
          end_datetime: '2026-05-01T07:28:00+00:00',
        }],
        next_token: null,
      }),
    });

    const [workout] = await provider.getWorkoutSummaries(new Date('2026-05-01'), new Date('2026-05-02'));
    expect(workout.id).toBe('oura-abc123');
    expect(workout.externalId).toBe('abc123');
    expect(workout.kind).toBe('run');
    expect(workout.durationMinutes).toBe(28);
    expect(workout.distanceKm).toBe(5.23);
    expect(workout.activeEnergyKcal).toBe(320);
    expect(workout.source).toBe('oura');
  });

  it('maps an unrecognized workout activity string to "other" rather than throwing', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 'x', activity: 'some_new_oura_activity', start_datetime: '2026-05-01T07:00:00Z', end_datetime: '2026-05-01T07:10:00Z' }],
        next_token: null,
      }),
    });

    const [workout] = await provider.getWorkoutSummaries(new Date('2026-05-01'), new Date('2026-05-02'));
    expect(workout.kind).toBe('other');
  });

  it('follows next_token pagination across multiple pages', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ day: '2026-05-01', steps: 100 }], next_token: 'PAGE2' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ day: '2026-05-02', steps: 200 }], next_token: null }) });

    const activity = await provider.getDailyActivityRange(new Date('2026-05-01'), new Date('2026-05-02'));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain('next_token=PAGE2');
    expect(activity.map(a => a.date)).toEqual(['2026-05-01', '2026-05-02']);
  });

  it('maps personal_info weight to a BodyWeightSample dated today', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ weight: 74.8 }) });

    const weight = await provider.getLatestBodyWeight();

    expect(weight?.weightKg).toBe(74.8);
    expect(weight?.source).toBe('oura');
    expect(fetchMock.mock.calls[0][0]).toContain('/personal_info');
  });

  it('getBodyWeightRange always returns an empty array (no history endpoint)', async () => {
    expect(await provider.getBodyWeightRange()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// A swallowed failure and "the user genuinely had no data" both surface as []
// to CompositeHealthDataProvider, so the warning is the only thing that tells
// the two apart in production logs.
describe('OuraProvider — failure logging', () => {
  let store: AsyncStorageTokenStore;
  let provider: OuraProvider;
  let fetchMock: ReturnType<typeof vi.fn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    store = new AsyncStorageTokenStore();
    provider = new OuraProvider(store);
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await store.setToken('oura', { accessToken: 'VALID', expiresAt: '2099-01-01T00:00:00Z' });
  });

  afterEach(async () => {
    await AsyncStorageTokenStore.purge();
    vi.restoreAllMocks();
  });

  it('names the endpoint when a paged request throws', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    expect(await provider.getSleepSummary(new Date('2026-05-01'), new Date('2026-05-07'))).toEqual([]);
    expect(String(warnSpy.mock.calls[0][0])).toContain('/sleep');
  });

  it('reports the status code on a non-OK response', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) });

    expect(await provider.getSleepSummary(new Date('2026-05-01'), new Date('2026-05-07'))).toEqual([]);
    expect(String(warnSpy.mock.calls[0][0])).toContain('429');
  });

  it('warns when the response body is unreadable', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => { throw new Error('bad json'); } });

    expect(await provider.getSleepSummary(new Date('2026-05-01'), new Date('2026-05-07'))).toEqual([]);
    expect(String(warnSpy.mock.calls[0][0])).toContain('unreadable');
  });

  it('warns when getLatestBodyWeight hits a non-OK /personal_info', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) });

    expect(await provider.getLatestBodyWeight()).toBeNull();
    expect(String(warnSpy.mock.calls[0][0])).toContain('/personal_info');
  });

  it('stays silent when no token is stored — "not connected" is not a failure', async () => {
    await AsyncStorageTokenStore.purge();

    expect(await provider.getSleepSummary(new Date('2026-05-01'), new Date('2026-05-07'))).toEqual([]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('stays silent on a successful empty page', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ data: [], next_token: null }) });

    expect(await provider.getSleepSummary(new Date('2026-05-01'), new Date('2026-05-07'))).toEqual([]);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
