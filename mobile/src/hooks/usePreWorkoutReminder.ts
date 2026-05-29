// ── usePreWorkoutReminder
//
// Naplánuje push notifikaci s pre-workout fueling hint X minut před
// dnešním tréninkem. Tělo zprávy = fueling.pre.note + dávky z computeFueling.
//
// Logika:
//   1. Pokud dnešní session je rest → cancel reminder.
//   2. Pokud session má durationMinutes > 0, naplánujeme notifikaci
//      90 min (default) před začátkem session.
//      Bez explicitního time-of-day si určíme "tréninkový čas" jako:
//        - 18:00 default (večerní trénink)
//        - 06:30 ráno pokud kind je 'easy_run' / 'long_run'
//
// Nastavení (enabled, minutesBefore) persistuje v AsyncStorage.

import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNutriFit } from '../context/NutriFitContext';
import { computeFueling } from '../lib/nutrition/workoutFueling';
import { createNotificationScheduler, type NotificationMode } from '../lib/notifications';
import type { TrainingSession } from '../types';

const SETTINGS_KEY = 'nutrifit.preWorkoutReminder.settings.v1';
const NOTIFICATION_ID = 'pre_workout_reminder';

export type PreWorkoutReminderSettings = {
  enabled: boolean;
  /** Kolik minut před začátkem tréninku má notifikace přijít. */
  minutesBefore: number;
};

const DEFAULT_SETTINGS: PreWorkoutReminderSettings = {
  enabled: false,
  minutesBefore: 90,
};

export type PreWorkoutReminderState = {
  settings: PreWorkoutReminderSettings;
  isReady: boolean;
  update: (patch: Partial<PreWorkoutReminderSettings>) => Promise<void>;
};

/** Convert plánovaný session na předpokládaný start time DNES (Date). */
function estimatedStartTime(session: TrainingSession, today: Date = new Date()): Date {
  const d = new Date(today);
  d.setSeconds(0, 0);
  // Heuristika: long_run / easy_run = ráno, rest = none, jinak večer.
  if (session.kind === 'long_run' || session.kind === 'easy_run' || session.kind === 'recovery_run') {
    d.setHours(6, 30, 0, 0);
  } else if (session.kind === 'rest') {
    return new Date(NaN);
  } else {
    d.setHours(18, 0, 0, 0);
  }
  return d;
}

export function usePreWorkoutReminder(mode: NotificationMode = 'auto'): PreWorkoutReminderState {
  const { profile, currentSession: todaySession } = useNutriFit();
  const [settings, setSettings] = useState<PreWorkoutReminderSettings>(DEFAULT_SETTINGS);
  const [isReady, setIsReady] = useState(false);
  const scheduler = createNotificationScheduler(mode);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(SETTINGS_KEY).then(raw => {
      if (!active) return;
      if (raw) {
        try {
          setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
        } catch { /* ignore */ }
      }
      setIsReady(true);
    });
    return () => { active = false; };
  }, []);

  // (Re-)schedule whenever settings change or today's session changes.
  useEffect(() => {
    if (!isReady) return;
    if (!settings.enabled || !todaySession || !profile) {
      void scheduler.cancel(NOTIFICATION_ID);
      return;
    }
    if (todaySession.kind === 'rest' || todaySession.durationMinutes === 0) {
      void scheduler.cancel(NOTIFICATION_ID);
      return;
    }
    const start = estimatedStartTime(todaySession);
    if (isNaN(start.getTime())) return;
    const fireAt = new Date(start.getTime() - settings.minutesBefore * 60_000);
    const secondsFromNow = Math.floor((fireAt.getTime() - Date.now()) / 1000);
    if (secondsFromNow < 60) {
      // Trénink už byl nebo začíná — nemá smysl planovat.
      void scheduler.cancel(NOTIFICATION_ID);
      return;
    }
    const fueling = computeFueling({ workout: { kind: workoutKindOfSession(todaySession.kind), durationMinutes: todaySession.durationMinutes }, weightKg: profile.weight });
    const preNote = fueling.pre
      ? `Sneď ${fueling.pre.carbsG} g sacharidů + ${fueling.pre.proteinG} g bílkovin. ${fueling.pre.note}`
      : `Drž lehkou hydrataci a pohyb. Pre-fuel není kritický pro tento trénink.`;
    void scheduler.scheduleAt({
      id: NOTIFICATION_ID,
      title: `🍌 Pre-workout: ${todaySession.title}`,
      body: preNote,
      triggerInSeconds: secondsFromNow,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, settings.enabled, settings.minutesBefore, todaySession?.kind, todaySession?.durationMinutes, profile?.weight]);

  const update = useCallback(async (patch: Partial<PreWorkoutReminderSettings>) => {
    setSettings(prev => {
      const merged = { ...prev, ...patch };
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(merged)).catch(() => undefined);
      return merged;
    });
  }, []);

  return { settings, isReady, update };
}

/** Mapuje SessionKind → WorkoutKind pro computeFueling. */
function workoutKindOfSession(kind: TrainingSession['kind']): any {
  if (kind === 'easy_run' || kind === 'tempo' || kind === 'intervals' || kind === 'long_run' || kind === 'recovery_run') return 'run';
  if (kind === 'swim') return 'swim';
  if (kind === 'bike') return 'cycle';
  if (kind === 'strength') return 'strength';
  if (kind === 'functional') return 'functional';
  if (kind === 'mobility') return 'yoga';
  return 'other';
}
