// ── OURA RING OAUTH ORCHESTRATOR
//
// Oura poskytuje sleep score, HRV, RHR, body temperature, recovery,
// activity score. Stejný flow jako Whoop (form-encoded body, plain OAuth
// without PKCE). Komplementární k Whoopu — Oura uživatelé tíhnou k
// minimalist wellness, Whoop k athletic performance.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';
import { getAuthHeaders } from '../../../services/supabase';
import type { OAuthTokenStore } from './OAuthTokenStore';
import { generateRandomHex, parseQuery } from './oauthShared';

const STATE_KEY = 'nutrifit.oauth.oura.state.v1';
const BRIDGE_URL = 'https://nutri-fit-omega.vercel.app/oura-callback.html';
const EXCHANGE_URL = 'https://nutri-fit-omega.vercel.app/api/oura/exchange';
const REFRESH_URL = 'https://nutri-fit-omega.vercel.app/api/oura/refresh';
const DEEP_LINK_PATH = 'oura/callback';
const OURA_AUTH = 'https://cloud.ouraring.com/oauth/authorize';
const DEFAULT_SCOPES = 'email personal daily heartrate workout tag session spo2 ring_configuration';

export type OuraOAuthConfig = {
  clientId: string;
  scope?: string;
};

export type OuraConnectResult =
  | { ok: true }
  | { ok: false; reason: string };

export class OuraOAuth {
  constructor(
    private readonly config: OuraOAuthConfig,
    private readonly tokens: OAuthTokenStore,
  ) {}

  async beginConnect(): Promise<void> {
    if (!this.config.clientId) {
      throw new Error('Oura client ID není nastavený (env EXPO_PUBLIC_OURA_CLIENT_ID).');
    }
    const state = generateRandomHex(16);
    await AsyncStorage.setItem(STATE_KEY, state);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: BRIDGE_URL,
      scope: this.config.scope ?? DEFAULT_SCOPES,
      state,
    });
    await Linking.openURL(`${OURA_AUTH}?${params.toString()}`);
  }

  attachListener(onResult: (r: OuraConnectResult) => void): () => void {
    const subscription = Linking.addEventListener('url', async ({ url }) => {
      if (!url.includes(DEEP_LINK_PATH)) return;
      const result = await this.handleCallback(url);
      onResult(result);
    });
    return () => subscription.remove();
  }

  async handleCallback(url: string): Promise<OuraConnectResult> {
    const parsed = parseQuery(url);
    const expectedState = await AsyncStorage.getItem(STATE_KEY);
    await AsyncStorage.removeItem(STATE_KEY);

    if (parsed.error) return { ok: false, reason: parsed.error };
    if (!parsed.code) return { ok: false, reason: 'missing_code' };
    if (expectedState && parsed.state !== expectedState) {
      return { ok: false, reason: 'state_mismatch' };
    }

    let res: Response;
    try {
      res = await fetch(EXCHANGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
        body: JSON.stringify({ code: parsed.code, redirectUri: BRIDGE_URL }),
      });
    } catch {
      return { ok: false, reason: 'network_error' };
    }
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.accessToken) {
      return { ok: false, reason: data?.error?.code || 'exchange_failed' };
    }

    await this.tokens.setToken('oura', {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: data.expiresAt,
      scope: data.scope,
    });
    return { ok: true };
  }

  /** Pokud token vypršel, požádej backend o nový skrz refresh_token. */
  async refresh(): Promise<boolean> {
    return refreshOuraToken(this.tokens);
  }
}

/** Standalone (class-independent) refresh so OuraProvider's data-fetching
 *  path can call it without needing a full OuraOAuth instance (which
 *  requires a clientId it has no use for here — refresh only needs the
 *  refreshToken already in the token store). Mirrors refreshStravaToken. */
export async function refreshOuraToken(tokens: OAuthTokenStore): Promise<boolean> {
  const token = await tokens.getToken('oura');
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
  await tokens.setToken('oura', {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresAt: data.expiresAt,
    scope: token.scope,
  });
  return true;
}
