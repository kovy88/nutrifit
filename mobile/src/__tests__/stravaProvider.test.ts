import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AsyncStorageTokenStore } from '../lib/health';
import { StravaProvider } from '../lib/health/StravaProvider';

describe('StravaProvider.getWorkoutSummaries — token refresh', () => {
  let store: AsyncStorageTokenStore;
  let provider: StravaProvider;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    store = new AsyncStorageTokenStore();
    provider = new StravaProvider(store);
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(async () => {
    await AsyncStorageTokenStore.purge();
    vi.restoreAllMocks();
  });

  it('returns empty array when no token is stored', async () => {
    const result = await provider.getWorkoutSummaries(new Date('2026-05-01'), new Date('2026-05-07'));
    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches directly with a valid (non-expired) token, no refresh attempted', async () => {
    await store.setToken('strava', { accessToken: 'VALID', expiresAt: '2099-01-01T00:00:00Z' });
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });

    await provider.getWorkoutSummaries(new Date('2026-05-01'), new Date('2026-05-07'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer VALID');
  });

  it('refreshes an expired token before fetching, then uses the new access token', async () => {
    await store.setToken('strava', {
      accessToken: 'OLD',
      refreshToken: 'REFRESH_TOKEN',
      expiresAt: '2020-01-01T00:00:00Z', // expired
    });

    // First call: backend token refresh. Second call: the actual Strava API request.
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accessToken: 'REFRESHED', refreshToken: 'NEW_REFRESH', expiresAt: '2099-01-01T00:00:00Z' }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });

    await provider.getWorkoutSummaries(new Date('2026-05-01'), new Date('2026-05-07'));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [refreshUrl] = fetchMock.mock.calls[0];
    expect(refreshUrl).toContain('/api/strava/refresh');
    const [activitiesUrl, activitiesOptions] = fetchMock.mock.calls[1];
    expect(activitiesUrl).toContain('/athlete/activities');
    expect(activitiesOptions.headers.Authorization).toBe('Bearer REFRESHED');

    const stored = await store.getToken('strava');
    expect(stored?.accessToken).toBe('REFRESHED');
  });

  it('returns empty array without hitting the Strava API when refresh fails', async () => {
    await store.setToken('strava', {
      accessToken: 'OLD',
      refreshToken: 'REFRESH_TOKEN',
      expiresAt: '2020-01-01T00:00:00Z', // expired
    });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: 'invalid_grant' }) });

    const result = await provider.getWorkoutSummaries(new Date('2026-05-01'), new Date('2026-05-07'));

    expect(result).toEqual([]);
    // Only the refresh attempt — never falls through to a stale-token API call.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fetches directly (no refresh) when token is expired but has no refreshToken', async () => {
    await store.setToken('strava', { accessToken: 'OLD', expiresAt: '2020-01-01T00:00:00Z' });
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });

    await provider.getWorkoutSummaries(new Date('2026-05-01'), new Date('2026-05-07'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/athlete/activities');
  });
});

// A swallowed failure and "the user genuinely had no workouts" both surface as
// [] to CompositeHealthDataProvider, so the warning is the only thing that tells
// the two apart in production logs.
describe('StravaProvider.getWorkoutSummaries — failure logging', () => {
  let store: AsyncStorageTokenStore;
  let provider: StravaProvider;
  let fetchMock: ReturnType<typeof vi.fn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    store = new AsyncStorageTokenStore();
    provider = new StravaProvider(store);
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await store.setToken('strava', { accessToken: 'VALID', expiresAt: '2099-01-01T00:00:00Z' });
  });

  afterEach(async () => {
    await AsyncStorageTokenStore.purge();
    vi.restoreAllMocks();
  });

  it('warns when the activities request throws', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    expect(await provider.getWorkoutSummaries(new Date('2026-05-01'), new Date('2026-05-07'))).toEqual([]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('StravaProvider');
  });

  it('warns with the status code when Strava returns a non-OK response', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });

    expect(await provider.getWorkoutSummaries(new Date('2026-05-01'), new Date('2026-05-07'))).toEqual([]);
    expect(String(warnSpy.mock.calls[0][0])).toContain('500');
  });

  it('warns when the token refresh fails', async () => {
    await store.setToken('strava', {
      accessToken: 'OLD',
      refreshToken: 'REFRESH_TOKEN',
      expiresAt: '2020-01-01T00:00:00Z',
    });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: 'invalid_grant' }) });

    expect(await provider.getWorkoutSummaries(new Date('2026-05-01'), new Date('2026-05-07'))).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('refresh failed'));
  });

  it('stays silent when no token is stored — "not connected" is not a failure', async () => {
    await AsyncStorageTokenStore.purge();

    expect(await provider.getWorkoutSummaries(new Date('2026-05-01'), new Date('2026-05-07'))).toEqual([]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('stays silent on a successful empty response', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });

    expect(await provider.getWorkoutSummaries(new Date('2026-05-01'), new Date('2026-05-07'))).toEqual([]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns when a 200 response has an unreadable body', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => { throw new Error('bad json'); } });

    expect(await provider.getWorkoutSummaries(new Date('2026-05-01'), new Date('2026-05-07'))).toEqual([]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('unreadable body');
  });
});
