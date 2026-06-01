import type { SyncConflict, SyncStatus } from '../types';

export type SyncState = {
  status: SyncStatus;
  lastSyncedAt: string | null;
  error: string | null;
  conflicts: SyncConflict[];
  pendingWrites: number;
};

type Listener = () => void;

let state: SyncState = {
  status: 'idle',
  lastSyncedAt: null,
  error: null,
  conflicts: [],
  pendingWrites: 0,
};

const listeners = new Set<Listener>();

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach(listener => listener());
}

export const syncStore = {
  getSnapshot: () => state,
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  setSyncing: () => setState({ status: 'syncing', error: null }),
  setIdle: (lastSyncedAt?: string | null) => setState({ status: 'idle', error: null, lastSyncedAt: lastSyncedAt ?? state.lastSyncedAt }),
  setOffline: () => setState({ status: 'offline' }),
  setError: (message: string) => setState({ status: 'error', error: message }),
  setConflicts: (conflicts: SyncConflict[]) => setState({ conflicts }),
  setPendingWrites: (pendingWrites: number) => setState({ pendingWrites }),
};
