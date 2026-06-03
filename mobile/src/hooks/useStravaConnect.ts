// ── useStravaConnect
//
// React wrapper kolem StravaOAuth. Inicializuje listener jen jednou,
// odpojí ho při unmount. Vrací connect() akci pro UI tlačítko a state
// pro feedback uživateli.
//
// Spotřebovává EXPO_PUBLIC_STRAVA_CLIENT_ID z env (Strava developer app ID).
// Bez ID je connect() disabled a hook hlásí 'unavailable'.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createOAuthTokenStore,
  StravaOAuth,
  type StravaConnectResult,
} from '../lib/health';

export type StravaConnectStatus = 'idle' | 'connecting' | 'connected' | 'error' | 'unavailable';

export type UseStravaConnectState = {
  status: StravaConnectStatus;
  /** Chybový kód z poslední zhroucené pokus (např. 'state_mismatch'). */
  error: string | null;
  /** Pokud máme připojeného atleta, jeho display name. */
  athleteName: string | null;
  connect: () => Promise<void>;
};

export function useStravaConnect(): UseStravaConnectState {
  const clientId = process.env.EXPO_PUBLIC_STRAVA_CLIENT_ID;
  const tokensRef = useRef(createOAuthTokenStore());
  const oauthRef = useRef<StravaOAuth | null>(
    clientId ? new StravaOAuth({ clientId }, tokensRef.current) : null,
  );
  const [state, setState] = useState<UseStravaConnectState>({
    status: clientId ? 'idle' : 'unavailable',
    error: null,
    athleteName: null,
    connect: async () => undefined,
  });

  // Mount: kontrola stávajícího tokenu + napojení deep link listeneru.
  useEffect(() => {
    let active = true;
    (async () => {
      const existing = await tokensRef.current.getToken('strava');
      if (active && existing) {
        const name = existing.metadata?.firstname ? String(existing.metadata.firstname) : null;
        setState(s => ({ ...s, status: 'connected', athleteName: name }));
      }
    })();

    if (!oauthRef.current) return;
    const detach = oauthRef.current.attachListener((result: StravaConnectResult) => {
      if (!active) return;
      if (result.ok) {
        setState(s => ({
          ...s,
          status: 'connected',
          error: null,
          athleteName: result.athlete?.firstname ?? null,
        }));
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

  // Re-bind connect (každý render má novou closure, ale state.connect ji
  // potřebuje pro UI button — udělejme z toho stabilní wrapper).
  useEffect(() => {
    setState(s => (s.connect === connect ? s : { ...s, connect }));
  }, [connect]);

  return state;
}
