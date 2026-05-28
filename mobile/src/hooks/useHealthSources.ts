// ── useHealthSources
//
// Sleduje, které OAuth zdroje (Strava, Whoop, Garmin, …) jsou aktuálně
// připojené, a poskytuje connect/disconnect akce. Used by SettingsScreen.
//
// Nativní zdroje (Apple Health, Health Connect) řeší platform-level gate
// — vrátíme jejich isAvailable() a getPermissionStatus(), ne token.

import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import {
  AppleHealthProvider,
  createOAuthTokenStore,
  HealthConnectProvider,
  type HealthPermissionStatus,
  type OAuthService,
} from '../lib/health';

export type NativeSourceState = {
  platform: 'ios' | 'android' | 'unsupported';
  available: boolean;
  permission: HealthPermissionStatus;
};

export type HealthSourcesState = {
  /** Které OAuth služby mají uložený token. */
  connectedOAuth: OAuthService[];
  /** Stav nativního zdroje (Apple Health na iOS / Health Connect na Android). */
  native: NativeSourceState;
  isLoading: boolean;
  /** Disconnect a specific OAuth source (clears stored token). */
  disconnect: (service: OAuthService) => Promise<void>;
  /** Manually re-fetch. Used after returning from an OAuth flow. */
  refresh: () => Promise<void>;
};

export function useHealthSources(): HealthSourcesState {
  const [connectedOAuth, setConnectedOAuth] = useState<OAuthService[]>([]);
  const [native, setNative] = useState<NativeSourceState>({
    platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'unsupported',
    available: false,
    permission: 'not_determined',
  });
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const store = createOAuthTokenStore();
    const oauth = await store.listConnected();

    let nextNative: NativeSourceState;
    if (Platform.OS === 'ios' && AppleHealthProvider.isSupported()) {
      const p = new AppleHealthProvider();
      nextNative = {
        platform: 'ios',
        available: await p.isAvailable(),
        permission: await p.getPermissionStatus(),
      };
    } else if (Platform.OS === 'android' && HealthConnectProvider.isSupported()) {
      const p = new HealthConnectProvider();
      nextNative = {
        platform: 'android',
        available: await p.isAvailable(),
        permission: await p.getPermissionStatus(),
      };
    } else {
      nextNative = { platform: 'unsupported', available: false, permission: 'unavailable' };
    }

    setConnectedOAuth(oauth);
    setNative(nextNative);
    setIsLoading(false);
  }, []);

  const disconnect = useCallback(async (service: OAuthService) => {
    const store = createOAuthTokenStore();
    await store.clearToken(service);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { connectedOAuth, native, isLoading, disconnect, refresh };
}
