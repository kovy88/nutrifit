import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AsyncStorageTokenStore, OuraOAuth } from '../lib/health';

describe('OuraOAuth.handleCallback', () => {
  let store: AsyncStorageTokenStore;
  let oauth: OuraOAuth;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    store = new AsyncStorageTokenStore();
    oauth = new OuraOAuth({ clientId: 'cid' }, store);
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
  });

  afterEach(async () => {
    await AsyncStorageTokenStore.purge();
    vi.restoreAllMocks();
  });

  it('rejects callback with error param', async () => {
    const result = await oauth.handleCallback('nutrifit://oura/callback?error=access_denied');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('access_denied');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects on state mismatch', async () => {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem('nutrifit.oauth.oura.state.v1', 'good');
    const result = await oauth.handleCallback('nutrifit://oura/callback?code=C&state=bad');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('state_mismatch');
  });

  it('successful exchange stores token', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        accessToken: 'OURA_T',
        refreshToken: 'OURA_R',
        expiresAt: '2099-01-01T00:00:00Z',
        scope: 'daily heartrate',
      }),
    });
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem('nutrifit.oauth.oura.state.v1', 'csrf');
    const result = await oauth.handleCallback('nutrifit://oura/callback?code=ABC&state=csrf');
    expect(result.ok).toBe(true);
    const stored = await store.getToken('oura');
    expect(stored?.accessToken).toBe('OURA_T');
    expect(stored?.refreshToken).toBe('OURA_R');
  });

  it('exchange body includes redirectUri', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ accessToken: 't', refreshToken: 'r', expiresAt: '2099-01-01T00:00:00Z' }),
    });
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem('nutrifit.oauth.oura.state.v1', 'csrf');
    await oauth.handleCallback('nutrifit://oura/callback?code=ABC&state=csrf');
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.code).toBe('ABC');
    expect(body.redirectUri).toContain('oura-callback.html');
  });
});

describe('OuraOAuth.refresh', () => {
  let store: AsyncStorageTokenStore;
  let oauth: OuraOAuth;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    store = new AsyncStorageTokenStore();
    oauth = new OuraOAuth({ clientId: 'cid' }, store);
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
  });

  afterEach(async () => {
    await AsyncStorageTokenStore.purge();
    vi.restoreAllMocks();
  });

  it('returns false without stored token', async () => {
    expect(await oauth.refresh()).toBe(false);
  });

  it('rotates on success', async () => {
    await store.setToken('oura', { accessToken: 'old', refreshToken: 'old_r' });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ accessToken: 'NEW', refreshToken: 'NEW_R', expiresAt: '2099-01-01' }),
    });
    expect(await oauth.refresh()).toBe(true);
    expect((await store.getToken('oura'))?.accessToken).toBe('NEW');
  });
});
