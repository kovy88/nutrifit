// ── useGarminConnect
//
// Paralelní hook k useStravaConnect / useWhoopConnect. Garmin používá
// PKCE — orchestrátor si to řeší interně, hook ho jen vyvolá.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createOAuthTokenStore,
  GarminOAuth,
  type GarminConnectResult,
} from '../lib/health';

export type GarminConnectStatus = 'idle' | 'connecting' | 'connected' | 'error' | 'unavailable';

export type UseGarminConnectState = {
  status: GarminConnectStatus;
  error: string | null;
  connect: () => Promise<void>;
};

export function useGarminConnect(): UseGarminConnectState {
  const clientId = process.env.EXPO_PUBLIC_GARMIN_CLIENT_ID;
  const tokensRef = useRef(createOAuthTokenStore());
  const oauthRef = useRef<GarminOAuth | null>(
    clientId ? new GarminOAuth({ clientId }, tokensRef.current) : null,
  );
  const [state, setState] = useState<UseGarminConnectState>({
    status: clientId ? 'idle' : 'unavailable',
    error: null,
    connect: async () => undefined,
  });

  useEffect(() => {
    let active = true;
    (async () => {
      const existing = await tokensRef.current.getToken('garmin');
      if (active && existing) {
        setState(s => ({ ...s, status: 'connected' }));
      }
    })();

    if (!oauthRef.current) return;
    const detach = oauthRef.current.attachListener((result: GarminConnectResult) => {
      if (!active) return;
      if (result.ok) {
        setState(s => ({ ...s, status: 'connected', error: null }));
      } else {
        setState(s => ({ ...s, status: 'error', error: result.reason }));
      }
    });
    return () => {
      active = false;
      detach();
    };
  }, []);

  const connect = useCallback(async () => {
    if (!oauthRef.current) {
      setState(s => ({ ...s, status: 'unavailable', error: 'no_client_id' }));
      return;
    }
    setState(s => ({ ...s, status: 'connecting', error: null }));
    try {
      await oauthRef.current.beginConnect();
    } catch (err) {
      setState(s => ({ ...s, status: 'error', error: err instanceof Error ? err.message : 'open_failed' }));
    }
  }, []);

  useEffect(() => {
    setState(s => (s.connect === connect ? s : { ...s, connect }));
  }, [connect]);

  return state;
}
