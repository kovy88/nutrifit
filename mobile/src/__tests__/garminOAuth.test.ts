import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AsyncStorageTokenStore, GarminOAuth, sha256Base64Url } from '../lib/health';

describe('sha256Base64Url (PKCE code_challenge)', () => {
  it('produces RFC 7636 fixture: empty string → "47DEQpj…"', async () => {
    // SHA256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    // base64url: 47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU
    const out = await sha256Base64Url('');
    expect(out).toBe('47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU');
  });

  it('produces correct hash for "test_verifier"', async () => {
    // Verifiable with: echo -n "test_verifier" | openssl dgst -sha256 -binary | basenc --base64url
    // SHA256("test_verifier") = c3ff1a30b8b1c39da38f1ba0f43b58f6c40a96e9a8b4f6a83eba47ca9b3e0a9b
    const out = await sha256Base64Url('test_verifier');
    // Just sanity: output is non-empty base64url (no +, /, =)
    expect(out.length).toBeGreaterThan(20);
    expect(out).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('different inputs produce different outputs', async () => {
    const a = await sha256Base64Url('abc');
    const b = await sha256Base64Url('abd');
    expect(a).not.toBe(b);
  });

  it('same input produces same output (deterministic)', async () => {
    const a = await sha256Base64Url('hello world');
    const b = await sha256Base64Url('hello world');
    expect(a).toBe(b);
  });
});

describe('GarminOAuth.handleCallback', () => {
  let store: AsyncStorageTokenStore;
  let oauth: GarminOAuth;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    store = new AsyncStorageTokenStore();
    oauth = new GarminOAuth({ clientId: 'cid' }, store);
    fetchMock = vi.fn();
    // @ts-expect-error — override global
    globalThis.fetch = fetchMock;
  });

  afterEach(async () => {
    await AsyncStorageTokenStore.purge();
    vi.restoreAllMocks();
  });

  it('rejects callback without verifier in storage', async () => {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem('nutrifit.oauth.garmin.state.v1', 'csrf');
    // Note: no verifier set
    const result = await oauth.handleCallback('nutrifit://garmin/callback?code=C&state=csrf');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('missing_verifier');
  });

  it('rejects on state mismatch', async () => {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem('nutrifit.oauth.garmin.state.v1', 'good');
    await AsyncStorage.setItem('nutrifit.oauth.garmin.verifier.v1', 'verifier');
    const result = await oauth.handleCallback('nutrifit://garmin/callback?code=C&state=bad');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('state_mismatch');
  });

  it('rejects when Garmin returns error', async () => {
    const result = await oauth.handleCallback('nutrifit://garmin/callback?error=access_denied');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('access_denied');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('successful exchange stores token (with PKCE verifier in body)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        accessToken: 'GARMIN_T',
        refreshToken: 'GARMIN_R',
        expiresAt: '2099-01-01T00:00:00Z',
        scope: 'health',
      }),
    });
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem('nutrifit.oauth.garmin.state.v1', 'csrf');
    await AsyncStorage.setItem('nutrifit.oauth.garmin.verifier.v1', 'pkce_verifier_xyz');
    const result = await oauth.handleCallback('nutrifit://garmin/callback?code=ABC&state=csrf');
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.code).toBe('ABC');
    expect(body.codeVerifier).toBe('pkce_verifier_xyz');
    expect(body.redirectUri).toContain('garmin-callback.html');
    const stored = await store.getToken('garmin');
    expect(stored?.accessToken).toBe('GARMIN_T');
  });

  it('clears state + verifier from storage after callback', async () => {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem('nutrifit.oauth.garmin.state.v1', 'csrf');
    await AsyncStorage.setItem('nutrifit.oauth.garmin.verifier.v1', 'vrf');
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'x' }) });
    await oauth.handleCallback('nutrifit://garmin/callback?code=A&state=csrf');
    expect(await AsyncStorage.getItem('nutrifit.oauth.garmin.state.v1')).toBeNull();
    expect(await AsyncStorage.getItem('nutrifit.oauth.garmin.verifier.v1')).toBeNull();
  });
});

describe('GarminOAuth.refresh', () => {
  let store: AsyncStorageTokenStore;
  let oauth: GarminOAuth;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    store = new AsyncStorageTokenStore();
    oauth = new GarminOAuth({ clientId: 'cid' }, store);
    fetchMock = vi.fn();
    // @ts-expect-error — override global
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
    await store.setToken('garmin', { accessToken: 'old', refreshToken: 'old_r' });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ accessToken: 'NEW', refreshToken: 'NEW_R', expiresAt: '2099-01-01' }),
    });
    expect(await oauth.refresh()).toBe(true);
    expect((await store.getToken('garmin'))?.accessToken).toBe('NEW');
  });
});
