import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AsyncStorageTokenStore, WhoopOAuth } from '../lib/health';

describe('WhoopOAuth.handleCallback', () => {
  let store: AsyncStorageTokenStore;
  let oauth: WhoopOAuth;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    store = new AsyncStorageTokenStore();
    oauth = new WhoopOAuth({ clientId: 'cid' }, store);
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(async () => {
    await AsyncStorageTokenStore.purge();
    vi.restoreAllMocks();
  });

  it('rejects callback with error param', async () => {
    const result = await oauth.handleCallback('nutrifit://whoop/callback?error=access_denied');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('access_denied');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects on state mismatch', async () => {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem('nutrifit.oauth.whoop.state.v1', 'good');
    const result = await oauth.handleCallback('nutrifit://whoop/callback?code=C&state=bad');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('state_mismatch');
  });

  it('successful exchange stores token', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        accessToken: 'WHOOP_TOKEN',
        refreshToken: 'WHOOP_REFRESH',
        expiresAt: '2099-01-01T00:00:00Z',
        scope: 'offline read:recovery',
      }),
    });
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem('nutrifit.oauth.whoop.state.v1', 'csrf');
    const result = await oauth.handleCallback('nutrifit://whoop/callback?code=ABC&state=csrf');
    expect(result.ok).toBe(true);
    const stored = await store.getToken('whoop');
    expect(stored?.accessToken).toBe('WHOOP_TOKEN');
    expect(stored?.refreshToken).toBe('WHOOP_REFRESH');
  });

  it('exchange request body includes redirectUri', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        accessToken: 't',
        refreshToken: 'r',
        expiresAt: '2099-01-01T00:00:00Z',
      }),
    });
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem('nutrifit.oauth.whoop.state.v1', 'csrf');
    await oauth.handleCallback('nutrifit://whoop/callback?code=ABC&state=csrf');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.code).toBe('ABC');
    expect(body.redirectUri).toContain('whoop-callback.html');
  });

  it('exchange failure propagates reason', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { code: 'invalid_grant' } }),
    });
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem('nutrifit.oauth.whoop.state.v1', 'csrf');
    const result = await oauth.handleCallback('nutrifit://whoop/callback?code=A&state=csrf');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_grant');
    expect(await store.getToken('whoop')).toBeNull();
  });
});

describe('WhoopOAuth.refresh', () => {
  let store: AsyncStorageTokenStore;
  let oauth: WhoopOAuth;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    store = new AsyncStorageTokenStore();
    oauth = new WhoopOAuth({ clientId: 'cid' }, store);
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(async () => {
    await AsyncStorageTokenStore.purge();
    vi.restoreAllMocks();
  });

  it('returns false without stored token', async () => {
    expect(await oauth.refresh()).toBe(false);
  });

  it('rotates token on success', async () => {
    await store.setToken('whoop', { accessToken: 'old', refreshToken: 'old_r' });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ accessToken: 'NEW', refreshToken: 'NEW_R', expiresAt: '2099-01-01' }),
    });
    expect(await oauth.refresh()).toBe(true);
    const stored = await store.getToken('whoop');
    expect(stored?.accessToken).toBe('NEW');
    expect(stored?.refreshToken).toBe('NEW_R');
  });
});
