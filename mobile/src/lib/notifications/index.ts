// ── lib/notifications barrel + factory
//
// Konzument: `import { createNotificationScheduler } from '@/lib/notifications'`.

import { ExpoNotificationScheduler } from './ExpoNotificationScheduler';
import { NoopNotificationScheduler } from './NoopNotificationScheduler';
import type { NotificationScheduler } from './NotificationScheduler';

export type {
  NotificationScheduler,
  LocalNotification,
  DailyNotification,
  NotificationPermission,
} from './NotificationScheduler';
export { NoopNotificationScheduler } from './NoopNotificationScheduler';
export { ExpoNotificationScheduler } from './ExpoNotificationScheduler';

export type NotificationMode = 'auto' | 'noop' | 'expo';

/**
 * Vrátí scheduler instance.
 *   - mode='noop' — vždy Noop (užitečné v testech a Expo Go bez balíčku)
 *   - mode='expo' — vždy Expo (funguje jen pokud je package nainstalovaný)
 *   - mode='auto' — Expo pokud lze, jinak Noop. Auto detekce není sync;
 *                   v produkci by stejně mělo být explicitní 'expo' po
 *                   `expo install expo-notifications`.
 *
 * Pro current stav repa (žádný expo-notifications package): factory s 'auto'
 * vrátí Noop. Jakmile uživatel doinstaluje, stačí přepnout na 'expo'.
 */
export function createNotificationScheduler(mode: NotificationMode = 'auto'): NotificationScheduler {
  if (mode === 'expo') return new ExpoNotificationScheduler();
  if (mode === 'noop') return new NoopNotificationScheduler();
  // auto: expo-notifications je v package.json → použij ExpoNotificationScheduler.
  // ExpoNotificationScheduler dynamicky importuje modul a vrátí 'unavailable'
  // pokud native plugin chybí (Expo Go bez custom buildu).
  return new ExpoNotificationScheduler();
}
