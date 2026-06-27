import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'nutrifit.ratingPrompted';
const MIN_STREAK = 3;

async function hasBeenPrompted(): Promise<boolean> {
  const v = await AsyncStorage.getItem(STORAGE_KEY);
  return v === '1';
}

async function markPrompted(): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, '1');
}

async function tryRequestReview(): Promise<void> {
  try {
    const mod = await import('expo-store-review');
    if (await mod.isAvailableAsync()) {
      await mod.requestReview();
      await markPrompted();
    }
  } catch {
    // expo-store-review not installed or simulator — silent no-op
  }
}

/**
 * Triggers the native App Store / Play Store review dialog once,
 * after the user has a streak of MIN_STREAK or more days.
 * Safe to call on every render — fires at most once per install.
 */
export function useRatingPrompt(streakDays: number): void {
  const triggered = useRef(false);

  useEffect(() => {
    if (triggered.current || streakDays < MIN_STREAK) return;
    triggered.current = true;

    hasBeenPrompted().then(already => {
      if (!already) tryRequestReview();
    });
  }, [streakDays]);
}
