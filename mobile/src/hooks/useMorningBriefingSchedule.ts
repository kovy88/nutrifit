// ── useMorningBriefingSchedule
//
// Plánuje denní push notifikaci v určenou hodinu s tělem z
// composeMorningBriefing. Nastavení (povoleno / čas) persistuje v
// AsyncStorage.
//
// Logika:
//   1. Uživatel v Settings povolí + nastaví hodinu (default 07:00)
//   2. Při startu app (a po každé změně settings) hook zavolá
//      scheduler.scheduleDaily() s aktuálním tělem
//   3. Tělo se generuje z DENNÍHO snapshotu — readiness + load + macros
//      tak jak jsou DNES. Push fires ZÍTRA ráno (nebo dnes ráno pokud
//      ještě nenastala hodina).
//
// Pozn.: protože scheduleDaily je v noop modu jen "uloženo do AS", reálný
// push se neukáže dokud uživatel nedoinstaluje expo-notifications.
// Plné OS integraci dorazí v EAS Buildu.

import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTrenr } from '../context/TrenrContext';
import { useDailyCoachRecommendation } from './useDailyCoachRecommendation';
import {
  createNotificationScheduler,
  type NotificationMode,
  type NotificationPermission,
} from '../lib/notifications';

const SETTINGS_KEY = 'nutrifit.briefing.schedule.v1';
const NOTIFICATION_ID = 'morning_briefing';

export type MorningBriefingSettings = {
  enabled: boolean;
  hour: number;     // 0..23
  minute: number;   // 0..59
};

const DEFAULT_SETTINGS: MorningBriefingSettings = {
  enabled: false,
  hour: 7,
  minute: 0,
};

export type MorningBriefingScheduleState = {
  settings: MorningBriefingSettings;
  permission: NotificationPermission;
  isReady: boolean;
  /** Update settings (also reschedules / cancels the push). */
  update: (next: Partial<MorningBriefingSettings>) => Promise<void>;
  /** Spustí permission dialog (jen na real Expo modu). */
  requestPermission: () => Promise<NotificationPermission>;
};

/**
 * @param mode default 'auto' — Noop bez expo-notifications, Expo s ním.
 *             Předej 'expo' explicitně až po `expo install expo-notifications`.
 */
export function useMorningBriefingSchedule(mode: NotificationMode = 'auto'): MorningBriefingScheduleState {
  const { profile, currentSession: todaySession } = useTrenr();
  const { recommendation, coaching } = useDailyCoachRecommendation(new Date());
  const [settings, setSettings] = useState<MorningBriefingSettings>(DEFAULT_SETTINGS);
  const [permission, setPermission] = useState<NotificationPermission>('undetermined');
  const [isReady, setIsReady] = useState(false);
  const scheduler = createNotificationScheduler(mode);

  // Load settings on mount + initial permission probe.
  useEffect(() => {
    let active = true;
    (async () => {
      const [raw, perm] = await Promise.all([
        AsyncStorage.getItem(SETTINGS_KEY),
        scheduler.getPermission(),
      ]);
      if (!active) return;
      if (raw) {
        try {
          setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
        } catch {
          /* ignore */
        }
      }
      setPermission(perm);
      setIsReady(true);
    })();
    return () => {
      active = false;
    };
    // scheduler is stable per render — but to avoid recreating effect we
    // keep deps empty. Mode changes mid-life are unusual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-schedule whenever settings, coaching snapshot, or profile change.
  useEffect(() => {
    if (!isReady) return;
    if (!settings.enabled) {
      void scheduler.cancel(NOTIFICATION_ID);
      return;
    }
    if (!profile || !recommendation) return;
    const warnings = recommendation.warnings.length ? `\n${recommendation.warnings.slice(0, 2).join('\n')}` : '';
    const body = `${recommendation.headline}\n→ ${recommendation.coachNote}${warnings}`;
    void scheduler.scheduleDaily({
      id: NOTIFICATION_ID,
      title: 'Trenr',
      body,
      hour: settings.hour,
      minute: settings.minute,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isReady,
    settings.enabled,
    settings.hour,
    settings.minute,
    profile?.weight,
    recommendation?.headline,
    recommendation?.coachNote,
    recommendation?.warnings.join('|'),
    coaching.assessment?.level,
    coaching.trainingLoad?.status,
    todaySession?.kind,
  ]);

  const update = useCallback(async (next: Partial<MorningBriefingSettings>) => {
    setSettings(prev => {
      const merged = { ...prev, ...next };
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(merged)).catch(() => undefined);
      return merged;
    });
  }, []);

  const requestPermission = useCallback(async () => {
    const result = await scheduler.requestPermission();
    setPermission(result);
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { settings, permission, isReady, update, requestPermission };
}
