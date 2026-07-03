// ── useRecentWorkouts
//
// Načte zaznamenané workouty z aktivního HealthDataProvideru (Composite
// v auto módu mergne Apple Health + Strava + Whoop + Manual). Vrací je
// seřazené chronologicky nejnovější první.

import { useEffect, useState, useCallback } from 'react';
import { useHealthDataProvider } from './useHealthDataProvider';
import type { WorkoutSummary } from '../lib/health';

export type RecentWorkoutsState = {
  workouts: WorkoutSummary[];
  isLoading: boolean;
  refresh: () => Promise<void>;
};

type RecentWorkoutsData = Pick<RecentWorkoutsState, 'workouts' | 'isLoading'>;

export function useRecentWorkouts(days = 14): RecentWorkoutsState {
  const provider = useHealthDataProvider();
  const [state, setState] = useState<RecentWorkoutsData>({
    workouts: [],
    isLoading: true,
  });

  const refresh = useCallback(async () => {
    setState(s => ({ ...s, isLoading: true }));
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - days);
    try {
      const list = await provider.getWorkoutSummaries(start, end);
      // Newest first.
      const sorted = list.slice().sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      setState({ workouts: sorted, isLoading: false });
    } catch {
      setState({ workouts: [], isLoading: false });
    }
  }, [provider, days]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...state, refresh };
}
