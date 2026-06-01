// ── EXPO NOTIFICATION SCHEDULER (real implementation)
//
// Tenký wrapper nad `expo-notifications`. Aktivuje se jakmile uživatel
// nainstaluje balíček (`npx expo install expo-notifications`) a factory
// přepne mode na 'expo'.
//
// Klíčové: importujeme expo-notifications DYNAMICKY uvnitř metod, aby
// chybějící package nepoložil app na startu. Když balíček není, metody
// vrátí 'unavailable' a UI zobrazí návod.
//
// Reference: https://docs.expo.dev/versions/latest/sdk/notifications/

import type {
  DailyNotification,
  LocalNotification,
  NotificationPermission,
  NotificationScheduler,
} from './NotificationScheduler';

// Mapování nativních statusů na náš enum. expo-notifications vrací:
//   'granted' | 'denied' | 'undetermined'
function mapStatus(status?: string): NotificationPermission {
  if (status === 'granted') return 'granted';
  if (status === 'denied') return 'denied';
  return 'undetermined';
}

/** Helper: dynamický import s try/catch — vrátí null pokud package chybí. */
async function loadModule(): Promise<any> {
  if ((globalThis as any).__NUTRIFIT_TEST__) return null;
  try {
    // @ts-ignore — expo-notifications nemusí být v node_modules (optional native dep)
    return await import('expo-notifications');
  } catch {
    return null;
  }
}

export class ExpoNotificationScheduler implements NotificationScheduler {
  readonly name = 'expo' as const;

  async getPermission(): Promise<NotificationPermission> {
    const mod = await loadModule();
    if (!mod) return 'unavailable';
    try {
      const { status } = await mod.getPermissionsAsync();
      return mapStatus(status);
    } catch {
      return 'unavailable';
    }
  }

  async requestPermission(): Promise<NotificationPermission> {
    const mod = await loadModule();
    if (!mod) return 'unavailable';
    try {
      const { status } = await mod.requestPermissionsAsync();
      return mapStatus(status);
    } catch {
      return 'unavailable';
    }
  }

  async scheduleAt(notification: LocalNotification): Promise<void> {
    const mod = await loadModule();
    if (!mod) return;
    await mod.cancelScheduledNotificationAsync(notification.id).catch(() => undefined);
    await mod.scheduleNotificationAsync({
      identifier: notification.id,
      content: {
        title: notification.title,
        body: notification.body,
      },
      trigger: { seconds: notification.triggerInSeconds, type: 'timeInterval' },
    });
  }

  async scheduleDaily(notification: DailyNotification): Promise<void> {
    const mod = await loadModule();
    if (!mod) return;
    await mod.cancelScheduledNotificationAsync(notification.id).catch(() => undefined);
    await mod.scheduleNotificationAsync({
      identifier: notification.id,
      content: {
        title: notification.title,
        body: notification.body,
      },
      trigger: {
        hour: notification.hour,
        minute: notification.minute,
        repeats: true,
        type: 'daily',
      },
    });
  }

  async cancel(id: string): Promise<void> {
    const mod = await loadModule();
    if (!mod) return;
    await mod.cancelScheduledNotificationAsync(id).catch(() => undefined);
  }

  async cancelAll(): Promise<void> {
    const mod = await loadModule();
    if (!mod) return;
    await mod.cancelAllScheduledNotificationsAsync().catch(() => undefined);
  }

  async listScheduled(): Promise<string[]> {
    const mod = await loadModule();
    if (!mod) return [];
    try {
      const all = await mod.getAllScheduledNotificationsAsync();
      return all.map((n: any) => n.identifier as string).filter(Boolean);
    } catch {
      return [];
    }
  }
}
