// ── usePostWorkoutReminder
//
// Pendant k usePreWorkoutReminder — push X minut po předpokládaném konci
// tréninku s refuel dávkami (post). "Anabolic window" je obvykle 30 min
// po cvičení, takže default minutesAfter = 5 (krátce po skončení).

import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTrenr } from '../context/TrenrContext';
import { computeFueling } from '../lib/nutrition/workoutFueling';
import { createNotificationScheduler, type NotificationMode } from '../lib/notifications';
import type { TrainingSession } from '../types';

const SETTINGS_KEY = 'nutrifit.postWorkoutReminder.settings.v1';
const NOTIFICATION_ID = 'post_workout_reminder';

export type PostWorkoutReminderSettings = {
  enabled: boolean;
  /** Kolik minut po skončení tréninku přijít s push. */
  minutesAfter: number;
};

const DEFAULT_SETTINGS: PostWorkoutReminderSettings = {
  enabled: false,
  minutesAfter: 5,
};

export type PostWorkoutReminderState = {
  settings: PostWorkoutReminderSettings;
  isReady: boolean;
  update: (patch: Partial<PostWorkoutReminderSettings>) => Promise<void>;
};

/** Mirror logic z usePreWorkoutReminder — stejné odhady tréninkového času. */
function estimatedStartTime(session: TrainingSession, today: Date = new Date()): Date {
  const d = new Date(today);
  d.setSeconds(0, 0);
  if (session.kind === 'long_run' || session.kind === 'easy_run' || session.kind === 'recovery_run') {
    d.setHours(6, 30, 0, 0);
  } else if (session.kind === 'rest') {
    return new Date(NaN);
  } else {
    d.setHours(18, 0, 0, 0);
  }
  return d;
}

export function usePostWorkoutReminder(mode: NotificationMode = 'auto'): PostWorkoutReminderState {
  const { profile, currentSession: todaySession } = useTrenr();
  const [settings, setSettings] = useState<PostWorkoutReminderSettings>(DEFAULT_SETTINGS);
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
    const end = new Date(start.getTime() + todaySession.durationMinutes * 60_000);
    const fireAt = new Date(end.getTime() + settings.minutesAfter * 60_000);
    const secondsFromNow = Math.floor((fireAt.getTime() - Date.now()) / 1000);
    if (secondsFromNow < 60) {
      void scheduler.cancel(NOTIFICATION_ID);
      return;
    }
    const fueling = computeFueling({ workout: { kind: workoutKindOfSession(todaySession.kind), durationMinutes: todaySession.durationMinutes }, weightKg: profile.weight });
    const postNote = fueling.post
      ? `Sneď ${fueling.post.carbsG} g sacharidů + ${fueling.post.proteinG} g bílkovin do ${fueling.post.timingMinAfter} min. ${fueling.post.note}`
      : `Hydratuj se a sneď vyvážené jídlo během hodiny.`;
    void scheduler.scheduleAt({
      id: NOTIFICATION_ID,
      title: `Post-workout refuel: ${todaySession.title}`,
      body: postNote,
      triggerInSeconds: secondsFromNow,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, settings.enabled, settings.minutesAfter, todaySession?.kind, todaySession?.durationMinutes, profile?.weight]);

  const update = useCallback(async (patch: Partial<PostWorkoutReminderSettings>) => {
    setSettings(prev => {
      const merged = { ...prev, ...patch };
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(merged)).catch(() => undefined);
      return merged;
    });
  }, []);

  return { settings, isReady, update };
}

function workoutKindOfSession(kind: TrainingSession['kind']): any {
  if (kind === 'easy_run' || kind === 'tempo' || kind === 'intervals' || kind === 'long_run' || kind === 'recovery_run') return 'run';
  if (kind === 'swim') return 'swim';
  if (kind === 'bike') return 'cycle';
  if (kind === 'strength') return 'strength';
  if (kind === 'functional') return 'functional';
  if (kind === 'mobility') return 'yoga';
  return 'other';
}
