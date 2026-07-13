// ── STRAVA OAUTH ORCHESTRATOR
//
// End-to-end flow:
//   1. connect() vygeneruje CSRF state + uloží ho do AsyncStorage
//   2. Otevře browser na https://www.strava.com/oauth/authorize?...
//      s redirect_uri směřujícím na náš https bridge:
//        https://nutri-fit-omega.vercel.app/strava-callback.html
//   3. Uživatel autorizuje Stravu
//   4. Strava redirectne na bridge HTML, ten okamžitě skočí na
//      nutrifit://strava/callback?code=...&state=...
//   5. iOS/Android otevře app; Linking.addEventListener zachytí URL
//   6. handleCallback() ověří state, pošle code na /api/strava/exchange
//      (backend doplní client_secret) a uloží token přes OAuthTokenStore
//
// Není potřeba expo-auth-session — RN má `Linking` natively.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';
import { getAuthHeaders } from '../../../services/supabase';
import type { OAuthTokenStore } from './OAuthTokenStore';
import { generateRandomHex, parseQuery } from './oauthShared';

export { parseQuery } from './oauthShared';

const STATE_KEY = 'nutrifit.oauth.strava.state.v1';
const BRIDGE_URL = 'https://nutri-fit-omega.vercel.app/strava-callback.html';
const EXCHANGE_URL = 'https://nutri-fit-omega.vercel.app/api/strava/exchange';
const REFRESH_URL = 'https://nutri-fit-omega.vercel.app/api/strava/refresh';
const DEEP_LINK_PATH = 'strava/callback';
const STRAVA_AUTH = 'https://www.strava.com/oauth/authorize';
const DEFAULT_SCOPES = 'activity:read_all,profile:read_all';

export type StravaOAuthConfig = {
  /** Strava developer App ID. Veřejný (na rozdíl od client_secret). */
  clientId: string;
  /** Volitelný OAuth scope, default 'activity:read_all,profile:read_all'. */
  scope?: string;
};

export type StravaConnectResult =
  | { ok: true; athlete?: { id: number; firstname?: string; lastname?: string } }
  | { ok: false; reason: string };

export class StravaOAuth {
  constructor(
    private readonly config: StravaOAuthConfig,
    private readonly tokens: OAuthTokenStore,
  ) {}

  /** Spustí autorizační flow. UI by mělo zavolat `attachListener` PŘED tímhle,
   *  aby zachytilo callback i kdyby přišel rychle. */
  async beginConnect(): Promise<void> {
    if (!this.config.clientId) {
      throw new Error('Strava client ID is not configured (env EXPO_PUBLIC_STRAVA_CLIENT_ID).');
    }
    const state = generateRandomHex(16);
    await AsyncStorage.setItem(STATE_KEY, state);

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      redirect_uri: BRIDGE_URL,
      approval_prompt: 'auto',
      scope: this.config.scope ?? DEFAULT_SCOPES,
      state,
    });
    await Linking.openURL(`${STRAVA_AUTH}?${params.toString()}`);
  }

  /** Listener na deep link callback. Vrací unsubscribe funkci.
   *  Hook ji použije v useEffect cleanup. */
  attachListener(onResult: (r: StravaConnectResult) => void): () => void {
    const subscription = Linking.addEventListener('url', async ({ url }) => {
      if (!url.includes(DEEP_LINK_PATH)) return;
      const result = await this.handleCallback(url);
      onResult(result);
    });
    return () => subscription.remove();
  }

  /** Zpracuje deep link URL (extract code → exchange → token store). */
  async handleCallback(url: string): Promise<StravaConnectResult> {
    const parsed = parseQuery(url);
    const expectedState = await AsyncStorage.getItem(STATE_KEY);
    await AsyncStorage.removeItem(STATE_KEY);

    if (parsed.error) {
      return { ok: false, reason: parsed.error };
    }
    if (!parsed.code) {
      return { ok: false, reason: 'missing_code' };
    }
    // CSRF check — pokud state nesedí, někdo nám podstrčil callback.
    if (expectedState && parsed.state !== expectedState) {
      return { ok: false, reason: 'state_mismatch' };
    }

    let exchangeRes: Response;
    try {
      exchangeRes = await fetch(EXCHANGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
        body: JSON.stringify({ code: parsed.code }),
      });
    } catch {
      return { ok: false, reason: 'network_error' };
    }
    const data = await exchangeRes.json().catch(() => null);
    if (!exchangeRes.ok || !data?.accessToken) {
      return { ok: false, reason: data?.error?.code || 'exchange_failed' };
    }

    await this.tokens.setToken('strava', {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: data.expiresAt,
      scope: data.scope,
      metadata: data.athlete
        ? { athleteId: data.athlete.id, firstname: String(data.athlete.firstname || '') }
        : undefined,
    });

    return { ok: true, athlete: data.athlete ?? undefined };
  }

  /** Pokud token vypršel, požádej backend o nový skrz refresh_token. */
  async refresh(): Promise<boolean> {
    return refreshStravaToken(this.tokens);
  }
}

/** Standalone (class-independent) refresh so StravaProvider's data-fetching
 *  path can call it without needing a full StravaOAuth instance (which
 *  requires a clientId it has no use for here — refresh only needs the
 *  refreshToken already in the token store). */
export async function refreshStravaToken(tokens: OAuthTokenStore): Promise<boolean> {
  const token = await tokens.getToken('strava');
  if (!token?.refreshToken) return false;
  let res: Response;
  try {
    res = await fetch(REFRESH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
      body: JSON.stringify({ refreshToken: token.refreshToken }),
    });
  } catch {
    return false;
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.accessToken) return false;
  await tokens.setToken('strava', {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresAt: data.expiresAt,
    scope: token.scope,
    metadata: token.metadata,
  });
  return true;
}
