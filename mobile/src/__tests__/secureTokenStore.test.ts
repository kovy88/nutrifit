import { afterEach, describe, expect, it } from 'vitest';
import {
  AsyncStorageTokenStore,
  SecureOAuthTokenStore,
  createOAuthTokenStore,
  isSecureStoreAvailable,
} from '../lib/health';

// Bez expo-secure-store v node_modules → SecureOAuthTokenStore by měl
// fall-thru na AsyncStorageTokenStore. Tyhle testy ověří fallback path.

describe('SecureOAuthTokenStore — fallback without expo-secure-store', () => {
  afterEach(async () => {
    await AsyncStorageTokenStore.purge();
    await SecureOAuthTokenStore.purge();
  });

  it('factory returns a working store', () => {
    const s = createOAuthTokenStore();
    expect(s).toBeDefined();
    expect(typeof s.getToken).toBe('function');
  });

  it('isSecureStoreAvailable returns false without package', async () => {
    expect(await isSecureStoreAvailable()).toBe(false);
  });

  it('setToken + getToken roundtrip via fallback', async () => {
    const store = new SecureOAuthTokenStore();
    await store.setToken('strava', { accessToken: 'A', refreshToken: 'R' });
    const got = await store.getToken('strava');
    expect(got?.accessToken).toBe('A');
    expect(got?.refreshToken).toBe('R');
  });

  it('listConnected reflects stored tokens via fallback', async () => {
    const store = new SecureOAuthTokenStore();
    await store.setToken('strava', { accessToken: 'A' });
    await store.setToken('whoop', { accessToken: 'B' });
    const list = await store.listConnected();
    expect(list.sort()).toEqual(['strava', 'whoop']);
  });

  it('clearToken removes from fallback', async () => {
    const store = new SecureOAuthTokenStore();
    await store.setToken('strava', { accessToken: 'A' });
    await store.clearToken('strava');
    expect(await store.getToken('strava')).toBeNull();
  });

  it('purge clears all OAuth tokens across both stores', async () => {
    const async1 = new AsyncStorageTokenStore();
    await async1.setToken('strava', { accessToken: 'X' });
    const secure = new SecureOAuthTokenStore();
    await secure.setToken('whoop', { accessToken: 'Y' });
    await SecureOAuthTokenStore.purge();
    expect(await async1.getToken('strava')).toBeNull();
    expect(await secure.getToken('whoop')).toBeNull();
  });

  it('reading a service migrates AsyncStorage token (no-op in fallback mode)', async () => {
    // Pre-seed AsyncStorage with a token
    const async1 = new AsyncStorageTokenStore();
    await async1.setToken('garmin', { accessToken: 'G', refreshToken: 'G_R' });
    // Read via SecureStore — in fallback mode, just returns from AsyncStorage
    const secure = new SecureOAuthTokenStore();
    const got = await secure.getToken('garmin');
    expect(got?.accessToken).toBe('G');
  });
});
