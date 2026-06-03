// ── useOuraConnect — paralelní k Strava/Whoop/Garmin.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createOAuthTokenStore,
  OuraOAuth,
  type OuraConnectResult,
} from '../lib/health';

export type OuraConnectStatus = 'idle' | 'connecting' | 'connected' | 'error' | 'unavailable';

export type UseOuraConnectState = {
  status: OuraConnectStatus;
  error: string | null;
  connect: () => Promise<void>;
};

export function useOuraConnect(): UseOuraConnectState {
  const clientId = process.env.EXPO_PUBLIC_OURA_CLIENT_ID;
  const tokensRef = useRef(createOAuthTokenStore());
  const oauthRef = useRef<OuraOAuth | null>(
    clientId ? new OuraOAuth({ clientId }, tokensRef.current) : null,
  );
  const [state, setState] = useState<UseOuraConnectState>({
    status: clientId ? 'idle' : 'unavailable',
    error: null,
    connect: async () => undefined,
  });

  useEffect(() => {
    let active = true;
    (async () => {
      const existing = await tokensRef.current.getToken('oura');
      if (active && existing) {
        setState(s => ({ ...s, status: 'connected' }));
      }
    })();

    if (!oauthRef.current) return;
    const detach = oauthRef.current.attachListener((result: OuraConnectResult) => {
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
