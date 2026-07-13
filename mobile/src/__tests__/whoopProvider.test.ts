import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AsyncStorageTokenStore } from '../lib/health';
import { WhoopProvider } from '../lib/health/WhoopProvider';

describe('WhoopProvider — token handling', () => {
  let store: AsyncStorageTokenStore;
  let provider: WhoopProvider;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    store = new AsyncStorageTokenStore();
    provider = new WhoopProvider(store);
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(async () => {
    await AsyncStorageTokenStore.purge();
    vi.restoreAllMocks();
  });

  it('returns empty results with no token stored, without ever calling fetch', async () => {
    expect(await provider.getSleepSummary(new Date('2026-05-01'), new Date('2026-05-07'))).toEqual([]);
    expect(await provider.getDailyActivityRange()).toEqual([]);
    expect(await provider.getWorkoutSummaries(new Date('2026-05-01'), new Date('2026-05-07'))).toEqual([]);
    expect(await provider.getRecoveryInputs(new Date('2026-05-01'), new Date('2026-05-07'))).toEqual([]);
    expect(await provider.getLatestBodyWeight()).toBeNull();
    expect(await provider.getRestingHeartRate(new Date('2026-05-01'))).toBeNull();
    expect(await provider.getHrv(new Date('2026-05-01'))).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('isAvailable reflects whether a token is stored', async () => {
    expect(await provider.isAvailable()).toBe(false);
    await store.setToken('whoop', { accessToken: 'X' });
    expect(await provider.isAvailable()).toBe(true);
  });

  it('fetches with a valid (non-expired) token, no refresh attempted', async () => {
    await store.setToken('whoop', { accessToken: 'VALID', expiresAt: '2099-01-01T00:00:00Z' });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ records: [], next_token: null }) });

    await provider.getSleepSummary(new Date('2026-05-01'), new Date('2026-05-07'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/v2/activity/sleep');
    expect(options.headers.Authorization).toBe('Bearer VALID');
  });

  it('refreshes an expired token before fetching, then uses the new access token', async () => {
    await store.setToken('whoop', {
      accessToken: 'OLD',
      refreshToken: 'REFRESH_TOKEN',
      expiresAt: '2020-01-01T00:00:00Z',
    });
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accessToken: 'REFRESHED', refreshToken: 'NEW_REFRESH', expiresAt: '2099-01-01T00:00:00Z' }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ records: [], next_token: null }) });

    await provider.getSleepSummary(new Date('2026-05-01'), new Date('2026-05-07'));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('/api/whoop/refresh');
    const [sleepUrl, sleepOptions] = fetchMock.mock.calls[1];
    expect(sleepUrl).toContain('/v2/activity/sleep');
    expect(sleepOptions.headers.Authorization).toBe('Bearer REFRESHED');

    const stored = await store.getToken('whoop');
    expect(stored?.accessToken).toBe('REFRESHED');
  });

  it('returns empty without hitting the Whoop API when refresh fails', async () => {
    await store.setToken('whoop', {
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
    await store.setToken('whoop', { accessToken: 'OLD', expiresAt: '2020-01-01T00:00:00Z' });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ records: [], next_token: null }) });

    await provider.getSleepSummary(new Date('2026-05-01'), new Date('2026-05-07'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/v2/activity/sleep');
  });
});

describe('WhoopProvider — data mapping', () => {
  let store: AsyncStorageTokenStore;
  let provider: WhoopProvider;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    store = new AsyncStorageTokenStore();
    provider = new WhoopProvider(store);
    await store.setToken('whoop', { accessToken: 'VALID', expiresAt: '2099-01-01T00:00:00Z' });
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(async () => {
    await AsyncStorageTokenStore.purge();
    vi.restoreAllMocks();
  });

  it('maps a scored sleep record: stage-summary ms → minutes, efficiency to 0..1, dated by wake time (end)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        records: [{
          id: 's1',
          start: '2026-05-01T21:00:00Z',
          end: '2026-05-02T05:00:00Z',
          nap: false,
          score_state: 'SCORED',
          score: {
            stage_summary: {
              total_awake_time_milli: 30 * 60_000,
              total_light_sleep_time_milli: 330 * 60_000,
              total_slow_wave_sleep_time_milli: 60 * 60_000,
              total_rem_sleep_time_milli: 60 * 60_000,
            },
            sleep_efficiency_percentage: 93.75,
          },
        }],
        next_token: null,
      }),
    });

    const [summary] = await provider.getSleepSummary(new Date('2026-05-01'), new Date('2026-05-03'));

    expect(summary.date).toBe('2026-05-02'); // wake-up date, not bedtime
    expect(summary.totalMinutes).toBe(450); // light+deep+rem, excludes awake
    expect(summary.deepMinutes).toBe(60);
    expect(summary.remMinutes).toBe(60);
    expect(summary.awakeMinutes).toBe(30);
    expect(summary.efficiency).toBeCloseTo(0.9375);
    expect(summary.source).toBe('whoop');
  });

  it('skips sleep records that are not SCORED (e.g. PENDING_SCORE) rather than throwing', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        records: [{ id: 's1', start: '2026-05-01T21:00:00Z', end: '2026-05-02T05:00:00Z', nap: false, score_state: 'PENDING_SCORE' }],
        next_token: null,
      }),
    });

    expect(await provider.getSleepSummary(new Date('2026-05-01'), new Date('2026-05-03'))).toEqual([]);
  });

  it('maps workout records, computing duration/kcal/distance and mapping known sport_ids to WorkoutKind', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        records: [{
          id: 'w1',
          start: '2026-05-01T07:00:00Z',
          end: '2026-05-01T07:28:00Z',
          sport_id: 0, // Running
          score_state: 'SCORED',
          score: { average_heart_rate: 145, max_heart_rate: 168, kilojoule: 1339, distance_meter: 5230 },
        }],
        next_token: null,
      }),
    });

    const [workout] = await provider.getWorkoutSummaries(new Date('2026-05-01'), new Date('2026-05-02'));
    expect(workout.id).toBe('whoop-w1');
    expect(workout.externalId).toBe('w1');
    expect(workout.kind).toBe('run');
    expect(workout.durationMinutes).toBe(28);
    expect(workout.distanceKm).toBe(5.23);
    expect(workout.avgHeartRate).toBe(145);
    expect(workout.maxHeartRate).toBe(168);
    expect(workout.activeEnergyKcal).toBe(Math.round(1339 / 4.184));
    expect(workout.source).toBe('whoop');
  });

  it('maps an unrecognized sport_id to "other" rather than throwing', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        records: [{ id: 'w2', start: '2026-05-01T07:00:00Z', end: '2026-05-01T07:10:00Z', sport_id: 9999, score_state: 'SCORED', score: {} }],
        next_token: null,
      }),
    });

    const [workout] = await provider.getWorkoutSummaries(new Date('2026-05-01'), new Date('2026-05-02'));
    expect(workout.kind).toBe('other');
  });

  it('getHrv reads hrv_rmssd_milli from /v2/recovery, reporting metric rmssd', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        records: [{ cycle_id: 1, sleep_id: 's1', created_at: '2026-05-01T09:00:00Z', score_state: 'SCORED', score: { resting_heart_rate: 52, hrv_rmssd_milli: 48.3 } }],
        next_token: null,
      }),
    });

    const hrv = await provider.getHrv(new Date('2026-05-01'));
    expect(hrv).toEqual({ date: '2026-05-01', ms: 48, metric: 'rmssd', source: 'whoop' });
    expect(fetchMock.mock.calls[0][0]).toContain('/v2/recovery');
  });

  it('getRestingHeartRate reads resting_heart_rate from /v2/recovery', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        records: [{ cycle_id: 1, sleep_id: 's1', created_at: '2026-05-01T09:00:00Z', score_state: 'SCORED', score: { resting_heart_rate: 52, hrv_rmssd_milli: 48.3 } }],
        next_token: null,
      }),
    });

    const rhr = await provider.getRestingHeartRate(new Date('2026-05-01'));
    expect(rhr).toEqual({ date: '2026-05-01', bpm: 52, source: 'whoop' });
  });

  it('skips recovery records that are not SCORED', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        records: [{ cycle_id: 1, sleep_id: 's1', created_at: '2026-05-01T09:00:00Z', score_state: 'UNSCORABLE' }],
        next_token: null,
      }),
    });

    expect(await provider.getHrv(new Date('2026-05-01'))).toBeNull();
    expect(await provider.getRestingHeartRate(new Date('2026-05-01'))).toBeNull();
  });

  it('getRecoveryInputs combines sleep and recovery (RHR/HRV) per date', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/v2/activity/sleep')) {
        return {
          ok: true,
          json: async () => ({
            records: [{
              id: 's1', start: '2026-05-01T21:00:00Z', end: '2026-05-02T05:00:00Z', nap: false, score_state: 'SCORED',
              score: { stage_summary: { total_light_sleep_time_milli: 400 * 60_000, total_rem_sleep_time_milli: 60 * 60_000, total_slow_wave_sleep_time_milli: 20 * 60_000 }, sleep_efficiency_percentage: 90 },
            }],
            next_token: null,
          }),
        };
      }
      if (url.includes('/v2/recovery')) {
        return {
          ok: true,
          json: async () => ({
            records: [{ cycle_id: 1, sleep_id: 's1', created_at: '2026-05-02T05:30:00Z', score_state: 'SCORED', score: { resting_heart_rate: 50, hrv_rmssd_milli: 55 } }],
            next_token: null,
          }),
        };
      }
      return { ok: true, json: async () => ({ records: [], next_token: null }) };
    });

    const inputs = await provider.getRecoveryInputs(new Date('2026-05-01'), new Date('2026-05-03'));
    const day = inputs.find(i => i.date === '2026-05-02');
    expect(day?.todaySleepMinutes).toBe(480);
    expect(day?.todayRhrBpm).toBe(50);
    expect(day?.todayHrvMs).toBe(55);
  });

  it('follows next_token pagination, continuing via the nextToken query param', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ records: [{ id: 'w1', start: '2026-05-01T07:00:00Z', end: '2026-05-01T07:10:00Z', sport_id: 0, score_state: 'SCORED', score: {} }], next_token: 'PAGE2' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ records: [{ id: 'w2', start: '2026-05-02T07:00:00Z', end: '2026-05-02T07:10:00Z', sport_id: 0, score_state: 'SCORED', score: {} }], next_token: null }) });

    const workouts = await provider.getWorkoutSummaries(new Date('2026-05-01'), new Date('2026-05-03'));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain('nextToken=PAGE2');
    expect(workouts.map(w => w.id)).toEqual(['whoop-w1', 'whoop-w2']);
  });

  it('maps body measurement weight to a BodyWeightSample dated today', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ height_meter: 1.8, weight_kilogram: 78.5, max_heart_rate: 190 }) });

    const weight = await provider.getLatestBodyWeight();

    expect(weight?.weightKg).toBe(78.5);
    expect(weight?.source).toBe('whoop');
    expect(fetchMock.mock.calls[0][0]).toContain('/v2/user/measurement/body');
  });

  it('getBodyWeightRange always returns an empty array (no history endpoint)', async () => {
    expect(await provider.getBodyWeightRange()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('getDailyActivityRange always returns an empty array (Whoop is not a step counter)', async () => {
    expect(await provider.getDailyActivityRange()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
