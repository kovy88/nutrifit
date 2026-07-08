// ── WHOOP OAUTH ORCHESTRATOR
//
// Paralelní implementace k StravaOAuth — stejný flow (browser → web bridge
// → deep link → backend exchange → token store), jen jiné URL a parametry.
// Whoop poskytuje: sleep / HRV / RHR / recovery / workouts — to, co Strava
// nemá. Společně se Stravou tvoří solid recovery + load picture.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';
import { getAuthHeaders } from '../../../services/supabase';
import type { OAuthTokenStore } from './OAuthTokenStore';
import { generateRandomHex, parseQuery } from './oauthShared';

const STATE_KEY = 'nutrifit.oauth.whoop.state.v1';
const BRIDGE_URL = 'https://nutri-fit-omega.vercel.app/whoop-callback.html';
const EXCHANGE_URL = 'https://nutri-fit-omega.vercel.app/api/whoop/exchange';
const REFRESH_URL = 'https://nutri-fit-omega.vercel.app/api/whoop/refresh';
const DEEP_LINK_PATH = 'whoop/callback';
const WHOOP_AUTH = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const DEFAULT_SCOPES =
  'offline read:recovery read:sleep read:workout read:profile read:body_measurement read:cycles';

export type WhoopOAuthConfig = {
  clientId: string;
  scope?: string;
};

export type WhoopConnectResult =
  | { ok: true }
  | { ok: false; reason: string };

export class WhoopOAuth {
  constructor(
    private readonly config: WhoopOAuthConfig,
    private readonly tokens: OAuthTokenStore,
  ) {}

  async beginConnect(): Promise<void> {
    if (!this.config.clientId) {
      throw new Error('Whoop client ID není nastavený (env EXPO_PUBLIC_WHOOP_CLIENT_ID).');
    }
    const state = await generateRandomHex(16);
    await AsyncStorage.setItem(STATE_KEY, state);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: BRIDGE_URL,
      scope: this.config.scope ?? DEFAULT_SCOPES,
      state,
    });
    await Linking.openURL(`${WHOOP_AUTH}?${params.toString()}`);
  }

  attachListener(onResult: (r: WhoopConnectResult) => void): () => void {
    const subscription = Linking.addEventListener('url', async ({ url }) => {
      if (!url.includes(DEEP_LINK_PATH)) return;
      const result = await this.handleCallback(url);
      onResult(result);
    });
    return () => subscription.remove();
  }

  async handleCallback(url: string): Promise<WhoopConnectResult> {
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

    await this.tokens.setToken('whoop', {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: data.expiresAt,
      scope: data.scope,
    });
    return { ok: true };
  }

  /** Pokud token vypršel, požádej backend o nový skrz refresh_token. */
  async refresh(): Promise<boolean> {
    return refreshWhoopToken(this.tokens);
  }
}

/** Standalone (class-independent) refresh so WhoopProvider's data-fetching
 *  path can call it without needing a full WhoopOAuth instance (which
 *  requires a clientId it has no use for here — refresh only needs the
 *  refreshToken already in the token store). Mirrors refreshOuraToken. */
export async function refreshWhoopToken(tokens: OAuthTokenStore): Promise<boolean> {
  const token = await tokens.getToken('whoop');
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
  await tokens.setToken('whoop', {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresAt: data.expiresAt,
    scope: token.scope,
  });
  return true;
}
