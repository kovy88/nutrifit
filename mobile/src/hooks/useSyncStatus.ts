import { useSyncExternalStore } from 'react';
import { syncStore } from '../stores/syncStore';

export function useSyncStatus() {
  return useSyncExternalStore(syncStore.subscribe, syncStore.getSnapshot, syncStore.getSnapshot);
}
