// ── useWhoopConnect
//
// Paralelní hook k useStravaConnect. Stejné API:
//   { status, error, connect } — status: 'idle' | 'connecting' | 'connected' | 'error' | 'unavailable'

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createOAuthTokenStore,
  WhoopOAuth,
  type WhoopConnectResult,
} from '../lib/health';

export type WhoopConnectStatus = 'idle' | 'connecting' | 'connected' | 'error' | 'unavailable';

export type UseWhoopConnectState = {
  status: WhoopConnectStatus;
  error: string | null;
  connect: () => Promise<void>;
};

export function useWhoopConnect(): UseWhoopConnectState {
  const clientId = process.env.EXPO_PUBLIC_WHOOP_CLIENT_ID;
  const tokensRef = useRef(createOAuthTokenStore());
  const oauthRef = useRef<WhoopOAuth | null>(
    clientId ? new WhoopOAuth({ clientId }, tokensRef.current) : null,
  );
  const [state, setState] = useState<UseWhoopConnectState>({
    status: clientId ? 'idle' : 'unavailable',
    error: null,
    connect: async () => undefined,
  });

  useEffect(() => {
    let active = true;
    (async () => {
      const existing = await tokensRef.current.getToken('whoop');
      if (active && existing) {
        setState(s => ({ ...s, status: 'connected' }));
      }
    })();

    if (!oauthRef.current) return;
    const detach = oauthRef.current.attachListener((result: WhoopConnectResult) => {
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
