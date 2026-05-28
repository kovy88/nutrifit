// Smoke test pro useHealthSources. Renderless — testujeme jen čistou logiku
// (store roundtrip + disconnect). Plný React hooks test by vyžadoval
// @testing-library/react-native, který ještě nemáme.

import { afterEach, describe, expect, it } from 'vitest';
import { AsyncStorageTokenStore } from '../lib/health';

describe('OAuth tokens — disconnect lifecycle (used by useHealthSources)', () => {
  afterEach(async () => {
    await AsyncStorageTokenStore.purge();
  });

  it('listConnected reflects setToken / clearToken', async () => {
    const store = new AsyncStorageTokenStore();
    expect(await store.listConnected()).toEqual([]);

    await store.setToken('strava', { accessToken: 'a' });
    expect((await store.listConnected()).sort()).toEqual(['strava']);

    await store.setToken('whoop', { accessToken: 'b' });
    await store.setToken('oura', { accessToken: 'c' });
    expect((await store.listConnected()).sort()).toEqual(['oura', 'strava', 'whoop']);

    await store.clearToken('strava');
    expect((await store.listConnected()).sort()).toEqual(['oura', 'whoop']);
  });

  it('clearing a non-existent token is a no-op', async () => {
    const store = new AsyncStorageTokenStore();
    await store.clearToken('garmin');
    expect(await store.listConnected()).toEqual([]);
  });

  it('purge removes everything (used by full account deletion)', async () => {
    const store = new AsyncStorageTokenStore();
    await store.setToken('strava', { accessToken: 'a' });
    await store.setToken('whoop', { accessToken: 'b' });
    await store.setToken('fitbit', { accessToken: 'c' });
    await AsyncStorageTokenStore.purge();
    expect(await store.listConnected()).toEqual([]);
  });

  it('only one token per service (re-setToken overwrites)', async () => {
    const store = new AsyncStorageTokenStore();
    await store.setToken('strava', { accessToken: 'first', refreshToken: 'rf1' });
    await store.setToken('strava', { accessToken: 'second', refreshToken: 'rf2' });
    const got = await store.getToken('strava');
    expect(got?.accessToken).toBe('second');
    expect(got?.refreshToken).toBe('rf2');
    expect((await store.listConnected()).filter(s => s === 'strava').length).toBe(1);
  });
});
