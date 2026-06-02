import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AsyncStorageTokenStore, StravaOAuth, parseQuery } from '../lib/health';

describe('parseQuery', () => {
  it('extracts code + state from deep link', () => {
    const q = parseQuery('nutrifit://strava/callback?code=ABC123&state=xyz&scope=activity:read_all');
    expect(q.code).toBe('ABC123');
    expect(q.state).toBe('xyz');
  });

  it('extracts error param', () => {
    const q = parseQuery('nutrifit://strava/callback?error=access_denied&state=xyz');
    expect(q.error).toBe('access_denied');
    expect(q.code).toBeUndefined();
  });

  it('URL-decodes values', () => {
    const q = parseQuery('nutrifit://strava/callback?code=abc%2Fdef&state=hello%20world');
    expect(q.code).toBe('abc/def');
    expect(q.state).toBe('hello world');
  });

  it('handles missing query string', () => {
    const q = parseQuery('nutrifit://strava/callback');
    expect(q.code).toBeUndefined();
    expect(q.state).toBeUndefined();
    expect(q.error).toBeUndefined();
  });
});

describe('StravaOAuth.handleCallback', () => {
  let store: AsyncStorageTokenStore;
  let oauth: StravaOAuth;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    store = new AsyncStorageTokenStore();
    oauth = new StravaOAuth({ clientId: '12345' }, store);
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
  });

  afterEach(async () => {
    await AsyncStorageTokenStore.purge();
    vi.restoreAllMocks();
  });

  it('rejects callback without code', async () => {
    const result = await oauth.handleCallback('nutrifit://strava/callback?error=access_denied');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('access_denied');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects when state in store does not match', async () => {
    // Simulate begin: set state in storage
    await AsyncStorageTokenStore.purge();
    // Manually write state
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem('nutrifit.oauth.strava.state.v1', 'expected_state');
    const result = await oauth.handleCallback('nutrifit://strava/callback?code=C&state=wrong');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('state_mismatch');
  });

  it('accepts code, calls exchange, stores token', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        accessToken: 'TOKEN_X',
        refreshToken: 'REFRESH_X',
        expiresAt: '2099-01-01T00:00:00Z',
        scope: 'activity:read_all',
        athlete: { id: 42, firstname: 'Karel' },
      }),
    });
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem('nutrifit.oauth.strava.state.v1', 'csrf_state');
    const result = await oauth.handleCallback('nutrifit://strava/callback?code=ABC&state=csrf_state');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.athlete?.id).toBe(42);
    const stored = await store.getToken('strava');
    expect(stored?.accessToken).toBe('TOKEN_X');
    expect(stored?.refreshToken).toBe('REFRESH_X');
    expect(stored?.metadata?.athleteId).toBe(42);
  });

  it('propagates exchange failure as reason', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { code: 'exchange_bad' } }),
    });
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem('nutrifit.oauth.strava.state.v1', 'csrf');
    const result = await oauth.handleCallback('nutrifit://strava/callback?code=ABC&state=csrf');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('exchange_bad');
    expect(await store.getToken('strava')).toBeNull();
  });

  it('network error → reason network_error', async () => {
    fetchMock.mockRejectedValue(new Error('fetch failed'));
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem('nutrifit.oauth.strava.state.v1', 'csrf');
    const result = await oauth.handleCallback('nutrifit://strava/callback?code=ABC&state=csrf');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('network_error');
  });

  it('clears stored state after callback regardless of outcome', async () => {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem('nutrifit.oauth.strava.state.v1', 'csrf');
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'whatever' }) });
    await oauth.handleCallback('nutrifit://strava/callback?code=ABC&state=csrf');
    const after = await AsyncStorage.getItem('nutrifit.oauth.strava.state.v1');
    expect(after).toBeNull();
  });
});

describe('StravaOAuth.refresh', () => {
  let store: AsyncStorageTokenStore;
  let oauth: StravaOAuth;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    store = new AsyncStorageTokenStore();
    oauth = new StravaOAuth({ clientId: '12345' }, store);
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
  });

  afterEach(async () => {
    await AsyncStorageTokenStore.purge();
    vi.restoreAllMocks();
  });

  it('returns false when no token stored', async () => {
    expect(await oauth.refresh()).toBe(false);
  });

  it('rotates refresh token on success', async () => {
    await store.setToken('strava', { accessToken: 'old', refreshToken: 'old_refresh', expiresAt: '2020-01-01T00:00:00Z' });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        accessToken: 'NEW',
        refreshToken: 'NEW_REFRESH',
        expiresAt: '2099-01-01T00:00:00Z',
      }),
    });
    const ok = await oauth.refresh();
    expect(ok).toBe(true);
    const stored = await store.getToken('strava');
    expect(stored?.accessToken).toBe('NEW');
    expect(stored?.refreshToken).toBe('NEW_REFRESH');
  });

  it('returns false on backend error', async () => {
    await store.setToken('strava', { accessToken: 'a', refreshToken: 'r' });
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'unauthorized' }) });
    expect(await oauth.refresh()).toBe(false);
  });
});
