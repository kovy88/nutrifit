// ── GARMIN CONNECT OAUTH ORCHESTRATOR
//
// Stejný flow jako Strava/Whoop, ale Garmin Health API používá OAuth 2.0
// s PKCE (Proof Key for Code Exchange):
//   1. Vygenerujeme code_verifier (random 64-bytes base64url)
//   2. Spočteme code_challenge = SHA256(code_verifier) base64url
//   3. K authorize URL přidáme code_challenge + code_challenge_method=S256
//   4. Při exchange pošleme zpět code_verifier (server si ho ověří)
//
// Důvod PKCE: pokud někdo intercept-uje deep link s code, bez verifieru ho
// nemůže vyměnit. Standard pro public clients (mobilní appky).
//
// Setup: vyžaduje schválení Garmin Connect Developer Program (review ~2 týdny).

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';
import type { OAuthTokenStore } from './OAuthTokenStore';
import { parseQuery } from './StravaOAuth';

const STATE_KEY = 'nutrifit.oauth.garmin.state.v1';
const VERIFIER_KEY = 'nutrifit.oauth.garmin.verifier.v1';
const BRIDGE_URL = 'https://nutri-fit-omega.vercel.app/garmin-callback.html';
const EXCHANGE_URL = 'https://nutri-fit-omega.vercel.app/api/garmin/exchange';
const REFRESH_URL = 'https://nutri-fit-omega.vercel.app/api/garmin/refresh';
const DEEP_LINK_PATH = 'garmin/callback';
const GARMIN_AUTH = 'https://connect.garmin.com/oauth2Confirm';

export type GarminOAuthConfig = {
  clientId: string;
};

export type GarminConnectResult =
  | { ok: true }
  | { ok: false; reason: string };

export class GarminOAuth {
  constructor(
    private readonly config: GarminOAuthConfig,
    private readonly tokens: OAuthTokenStore,
  ) {}

  async beginConnect(): Promise<void> {
    if (!this.config.clientId) {
      throw new Error('Garmin client ID není nastavený (env EXPO_PUBLIC_GARMIN_CLIENT_ID).');
    }
    const state = generateRandom(16);
    const verifier = generateRandom(64);
    const challenge = await sha256Base64Url(verifier);
    await AsyncStorage.setItem(STATE_KEY, state);
    await AsyncStorage.setItem(VERIFIER_KEY, verifier);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: BRIDGE_URL,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    await Linking.openURL(`${GARMIN_AUTH}?${params.toString()}`);
  }

  attachListener(onResult: (r: GarminConnectResult) => void): () => void {
    const subscription = Linking.addEventListener('url', async ({ url }) => {
      if (!url.includes(DEEP_LINK_PATH)) return;
      const result = await this.handleCallback(url);
      onResult(result);
    });
    return () => subscription.remove();
  }

  async handleCallback(url: string): Promise<GarminConnectResult> {
    const parsed = parseQuery(url);
    const [expectedState, verifier] = await Promise.all([
      AsyncStorage.getItem(STATE_KEY),
      AsyncStorage.getItem(VERIFIER_KEY),
    ]);
    // Clean up stored CSRF + PKCE data regardless of outcome
    await AsyncStorage.multiRemove([STATE_KEY, VERIFIER_KEY]);

    if (parsed.error) return { ok: false, reason: parsed.error };
    if (!parsed.code) return { ok: false, reason: 'missing_code' };
    if (expectedState && parsed.state !== expectedState) {
      return { ok: false, reason: 'state_mismatch' };
    }
    if (!verifier) return { ok: false, reason: 'missing_verifier' };

    let res: Response;
    try {
      res = await fetch(EXCHANGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: parsed.code,
          codeVerifier: verifier,
          redirectUri: BRIDGE_URL,
        }),
      });
    } catch {
      return { ok: false, reason: 'network_error' };
    }
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.accessToken) {
      return { ok: false, reason: data?.error?.code || 'exchange_failed' };
    }

    await this.tokens.setToken('garmin', {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: data.expiresAt,
      scope: data.scope,
    });
    return { ok: true };
  }

  async refresh(): Promise<boolean> {
    const token = await this.tokens.getToken('garmin');
    if (!token?.refreshToken) return false;
    let res: Response;
    try {
      res = await fetch(REFRESH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: token.refreshToken }),
      });
    } catch {
      return false;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.accessToken) return false;
    await this.tokens.setToken('garmin', {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: data.expiresAt,
      scope: token.scope,
    });
    return true;
  }
}

// ── PKCE helpers ─────────────────────────────────────────────────────────────

/** Náhodný base64url string délky `bytes`. Bez crypto.getRandomValues
 *  závislosti — Math.random je pro state + verifier dostačující entropy
 *  (~1e19 kombinací pro 16 bytes). */
function generateRandom(bytes: number): string {
  let s = '';
  for (let i = 0; i < bytes; i++) {
    s += Math.floor(Math.random() * 16).toString(16);
  }
  return s.slice(0, bytes);
}

/** SHA256 + base64url. Používá `expo-crypto` (pokud je), jinak fallback
 *  na js-only SHA256 (níže). */
export async function sha256Base64Url(input: string): Promise<string> {
  try {
    // @ts-expect-error — expo-crypto je optional dep
    const mod = await import('expo-crypto');
    if (mod?.digestStringAsync) {
      const hash = await mod.digestStringAsync('SHA-256', input, { encoding: 'base64' });
      // expo-crypto returns base64 — convert to base64url
      return hash.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
  } catch {
    /* fall through to JS impl */
  }
  // Pure-JS SHA256 (compact impl — uses Uint8Array, no native crypto needed).
  const bytes = stringToUtf8Bytes(input);
  const digest = sha256Bytes(bytes);
  return base64UrlEncode(digest);
}

// ── pure-JS SHA-256 (RFC 6234) ──────────────────────────────────────────────

function stringToUtf8Bytes(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else if (c < 0xd800 || c >= 0xe000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    else {
      // surrogate pair
      i++;
      c = 0x10000 + (((c & 0x3ff) << 10) | (s.charCodeAt(i) & 0x3ff));
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return out;
}

function sha256Bytes(message: number[]): Uint8Array {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  let H = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const l = message.length;
  message.push(0x80);
  while (message.length % 64 !== 56) message.push(0);
  const lenBits = l * 8;
  message.push(0, 0, 0, 0, (lenBits >>> 24) & 0xff, (lenBits >>> 16) & 0xff, (lenBits >>> 8) & 0xff, lenBits & 0xff);

  for (let chunk = 0; chunk < message.length; chunk += 64) {
    const w = new Array(64).fill(0);
    for (let i = 0; i < 16; i++) {
      const off = chunk + i * 4;
      w[i] = (message[off] << 24) | (message[off + 1] << 16) | (message[off + 2] << 8) | message[off + 3];
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    H = [
      (H[0] + a) >>> 0, (H[1] + b) >>> 0, (H[2] + c) >>> 0, (H[3] + d) >>> 0,
      (H[4] + e) >>> 0, (H[5] + f) >>> 0, (H[6] + g) >>> 0, (H[7] + h) >>> 0,
    ];
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    out[i * 4] = (H[i] >>> 24) & 0xff;
    out[i * 4 + 1] = (H[i] >>> 16) & 0xff;
    out[i * 4 + 2] = (H[i] >>> 8) & 0xff;
    out[i * 4 + 3] = H[i] & 0xff;
  }
  return out;
}

function rotr(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Encode bytes to base64url (RFC 4648 §5), no padding. Pure JS table encoder
 *  so it works in Hermes/React Native, where neither `btoa` nor `Buffer`
 *  exists. (The old impl relied on both and crashed at runtime.) */
export function base64UrlEncode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const remaining = bytes.length - i;
    const b0 = bytes[i];
    const b1 = remaining > 1 ? bytes[i + 1] : 0;
    const b2 = remaining > 2 ? bytes[i + 2] : 0;
    const triplet = (b0 << 16) | (b1 << 8) | b2;
    out += BASE64URL_ALPHABET[(triplet >>> 18) & 0x3f];
    out += BASE64URL_ALPHABET[(triplet >>> 12) & 0x3f];
    if (remaining > 1) out += BASE64URL_ALPHABET[(triplet >>> 6) & 0x3f];
    if (remaining > 2) out += BASE64URL_ALPHABET[triplet & 0x3f];
  }
  return out;
}
