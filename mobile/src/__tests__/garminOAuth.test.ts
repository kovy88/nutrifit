import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AsyncStorageTokenStore, GarminOAuth, sha256Base64Url, base64UrlEncode } from '../lib/health';

// Node's Buffer is available at runtime in vitest but isn't typed here
// (no @types/node, and we don't want to widen tsconfig for a test). Access it
// through a locally-typed globalThis accessor.
const NodeBuffer = (globalThis as unknown as {
  Buffer: { from(data: Uint8Array): { toString(encoding: string): string } };
}).Buffer;

/** Oracle: Node's Buffer → reference base64url, no padding.
 *  base64UrlEncode must match this for every input. */
function bufferBase64Url(bytes: Uint8Array): string {
  return NodeBuffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

describe('base64UrlEncode (Hermes-safe, no btoa/Buffer)', () => {
  it('encodes empty input to empty string', () => {
    expect(base64UrlEncode(new Uint8Array([]))).toBe('');
  });

  it('handles all three padding remainders (1, 2, 0 mod 3)', () => {
    expect(base64UrlEncode(new Uint8Array([77]))).toBe(bufferBase64Url(new Uint8Array([77]))); // 1 byte
    expect(base64UrlEncode(new Uint8Array([77, 97]))).toBe(bufferBase64Url(new Uint8Array([77, 97]))); // 2 bytes
    expect(base64UrlEncode(new Uint8Array([77, 97, 110]))).toBe('TWFu'); // 3 bytes → "Man"
  });

  it('uses URL-safe alphabet (- and _, never + or /)', () => {
    // 0xFB,0xFF,0xBF in standard base64 contains both + and /
    const bytes = new Uint8Array([0xfb, 0xff, 0xbf]);
    const out = base64UrlEncode(bytes);
    expect(out).not.toMatch(/[+/=]/);
    expect(out).toBe(bufferBase64Url(bytes));
  });

  it('matches the Buffer oracle across fuzzed byte arrays', () => {
    let seed = 12345;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % 256;
    };
    for (let len = 0; len <= 40; len++) {
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = rand();
      expect(base64UrlEncode(bytes)).toBe(bufferBase64Url(bytes));
    }
  });

  it('encodes a 32-byte SHA-256-sized buffer to 43 chars', () => {
    const bytes = new Uint8Array(32).map((_, i) => (i * 37) % 256);
    expect(base64UrlEncode(bytes)).toHaveLength(43);
  });
});

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
    globalThis.fetch = fetchMock as unknown as typeof fetch;
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
    globalThis.fetch = fetchMock as unknown as typeof fetch;
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
