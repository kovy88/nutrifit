// ── NOTIFICATION SCHEDULER (interface + provider abstraction)
//
// Implementace expo-notifications dorazí jakmile uživatel přidá balíček:
//   npx expo install expo-notifications
//
// Zatím existují dvě implementace:
//   - NoopNotificationScheduler  — funguje v Expo Go bez balíčku;
//                                  loguje + drží schedule v paměti
//   - ExpoNotificationScheduler  — reálná, tenký wrapper nad
//                                  expo-notifications. Importuje se
//                                  dynamicky aby chybějící package
//                                  nepoložil app na startu.

export type LocalNotification = {
  /** Stabilní ID — opakované scheduleAt s tímhle ID přepíše předchozí. */
  id: string;
  title: string;
  body: string;
  /** Sekundy od teď. Pro denní opakování použij scheduleDaily(). */
  triggerInSeconds: number;
};

export type DailyNotification = {
  id: string;
  title: string;
  body: string;
  hour: number;    // 0..23
  minute: number;  // 0..59
};

export type NotificationPermission = 'granted' | 'denied' | 'undetermined' | 'unavailable';

export interface NotificationScheduler {
  readonly name: 'noop' | 'expo';

  /** Vrátí stav povolení k push notifikacím. */
  getPermission(): Promise<NotificationPermission>;

  /** Spustí native permission dialog. */
  requestPermission(): Promise<NotificationPermission>;

  /** Naplánuje jednorázovou notifikaci. */
  scheduleAt(notification: LocalNotification): Promise<void>;

  /** Naplánuje opakující se denní notifikaci. Stejné `id` přepíše. */
  scheduleDaily(notification: DailyNotification): Promise<void>;

  /** Zruší notifikaci podle ID. */
  cancel(id: string): Promise<void>;

  /** Zruší všechny naše notifikace. Used by account purge. */
  cancelAll(): Promise<void>;

  /** Seznam ID aktuálně naplánovaných notifikací (pro debug + Settings UI). */
  listScheduled(): Promise<string[]>;
}
