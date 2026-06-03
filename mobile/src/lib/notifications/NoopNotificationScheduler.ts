// ── NOOP NOTIFICATION SCHEDULER
//
// Funguje v Expo Go bez expo-notifications balíčku. Drží schedule v
// AsyncStorage takže přežije reload / restart. Skutečné notifikace
// nezobrazí — pouze "simuluje" naplánování. Užitečné pro vývoj UI
// a testy schedulerového flow.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  DailyNotification,
  LocalNotification,
  NotificationPermission,
  NotificationScheduler,
} from './NotificationScheduler';

const STORAGE_KEY = 'nutrifit.notifications.noop.v1';

type StoredEntry =
  | { type: 'oneshot'; notification: LocalNotification; scheduledFor: string }
  | { type: 'daily'; notification: DailyNotification };

export class NoopNotificationScheduler implements NotificationScheduler {
  readonly name = 'noop' as const;

  async getPermission(): Promise<NotificationPermission> {
    // Bez native modulu nemůžeme zjistit reálný stav — vždy 'undetermined'.
    return 'undetermined';
  }

  async requestPermission(): Promise<NotificationPermission> {
    // V Expo Go bez expo-notifications jsme bezzubí. Vrátíme 'unavailable'
    // aby UI vidělo "není dostupné, dokud nepřidáš expo-notifications".
    return 'unavailable';
  }

  async scheduleAt(notification: LocalNotification): Promise<void> {
    const all = await this.load();
    const scheduledFor = new Date(Date.now() + notification.triggerInSeconds * 1000).toISOString();
    const next = removeById(all, notification.id);
    next.push({ type: 'oneshot', notification, scheduledFor });
    await this.save(next);
  }

  async scheduleDaily(notification: DailyNotification): Promise<void> {
    const all = await this.load();
    const next = removeById(all, notification.id);
    next.push({ type: 'daily', notification });
    await this.save(next);
  }

  async cancel(id: string): Promise<void> {
    const all = await this.load();
    await this.save(removeById(all, id));
  }

  async cancelAll(): Promise<void> {
    await AsyncStorage.removeItem(STORAGE_KEY);
  }

  async listScheduled(): Promise<string[]> {
    const all = await this.load();
    return all.map(e => (e.type === 'oneshot' ? e.notification.id : e.notification.id));
  }

  /** Pro testy + debug — vrátí strukturu (ne jen ID). */
  async dump(): Promise<StoredEntry[]> {
    return this.load();
  }

  private async load(): Promise<StoredEntry[]> {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as StoredEntry[];
    } catch {
      return [];
    }
  }

  private async save(entries: StoredEntry[]): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }

  /** Wipe všech naplánovaných záznamů — pro account purge. */
  static async purge(): Promise<void> {
    await AsyncStorage.removeItem(STORAGE_KEY);
  }
}

function removeById(entries: StoredEntry[], id: string): StoredEntry[] {
  return entries.filter(e => {
    const entryId = e.type === 'oneshot' ? e.notification.id : e.notification.id;
    return entryId !== id;
  });
}
