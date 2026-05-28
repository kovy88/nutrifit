// ── OAUTH TOKEN STORE
//
// Centrální místo pro tokeny od externích služeb (Strava, Whoop, Garmin, …).
// Současná implementace používá AsyncStorage. Až přibude `expo-secure-store`
// (po `expo install expo-secure-store`), přepneme implementaci tam — tokeny
// patří do iOS Keychain / Android Keystore, ne do AsyncStorage v plain textu.
//
// Refresh logiku řeší konkrétní provider; tady jen čteme/píšeme.

import AsyncStorage from '@react-native-async-storage/async-storage';

export type OAuthToken = {
  accessToken: string;
  refreshToken?: string;
  /** ISO timestamp kdy vyprší. null/undefined = never expires. */
  expiresAt?: string;
  scope?: string;
  /** Some providers return additional metadata (athlete_id, user_id, …). */
  metadata?: Record<string, string | number>;
};

export type OAuthService =
  | 'strava'
  | 'whoop'
  | 'garmin'
  | 'polar'
  | 'oura'
  | 'fitbit';

export interface OAuthTokenStore {
  getToken(service: OAuthService): Promise<OAuthToken | null>;
  setToken(service: OAuthService, token: OAuthToken): Promise<void>;
  clearToken(service: OAuthService): Promise<void>;
  /** Returns list of services that have a stored token. Used by UI for
   *  showing which integrations are connected. */
  listConnected(): Promise<OAuthService[]>;
}

const KEY_PREFIX = 'nutrifit.oauth.';
const ALL_SERVICES: OAuthService[] = ['strava', 'whoop', 'garmin', 'polar', 'oura', 'fitbit'];

/** AsyncStorage-backed implementation. TODO: migrate to expo-secure-store. */
export class AsyncStorageTokenStore implements OAuthTokenStore {
  async getToken(service: OAuthService): Promise<OAuthToken | null> {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + service);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as OAuthToken;
      // Expired tokens are returned as-is — provider decides whether to refresh.
      return parsed;
    } catch {
      return null;
    }
  }

  async setToken(service: OAuthService, token: OAuthToken): Promise<void> {
    await AsyncStorage.setItem(KEY_PREFIX + service, JSON.stringify(token));
  }

  async clearToken(service: OAuthService): Promise<void> {
    await AsyncStorage.removeItem(KEY_PREFIX + service);
  }

  async listConnected(): Promise<OAuthService[]> {
    const out: OAuthService[] = [];
    for (const svc of ALL_SERVICES) {
      const t = await AsyncStorage.getItem(KEY_PREFIX + svc);
      if (t) out.push(svc);
    }
    return out;
  }

  /** Wipe all OAuth tokens. Called by account purge. */
  static async purge(): Promise<void> {
    const all = await AsyncStorage.getAllKeys();
    const ours = all.filter(k => k.startsWith(KEY_PREFIX));
    if (ours.length) await AsyncStorage.multiRemove(ours);
  }
}

/** Helper: is token expired? Provider uses this before each API call. */
export function isExpired(token: OAuthToken, skewSeconds = 60): boolean {
  if (!token.expiresAt) return false;
  return Date.now() >= new Date(token.expiresAt).getTime() - skewSeconds * 1000;
}
