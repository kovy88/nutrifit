// ── useStrainTrend
//
// Spočítá denní strain score 0–21 zpětně pro N dní z workout history
// (provider). Reuse computeDailyStrain — single source of truth.

import { useCallback, useEffect, useState } from 'react';
import { useHealthDataProvider } from './useHealthDataProvider';
import { computeDailyStrain } from '../lib/coaching/strainScore';
import type { TrendPoint } from '../components/MiniTrendChart';
import type { WorkoutSummary } from '../lib/health';

export type StrainTrendState = {
  data: TrendPoint[];
  isLoading: boolean;
  refresh: () => Promise<void>;
};

export function useStrainTrend(days = 14): StrainTrendState {
  const provider = useHealthDataProvider();
  const [state, setState] = useState<StrainTrendState>({
    data: [],
    isLoading: true,
    refresh: async () => {},
  });

  const refresh = useCallback(async () => {
    setState(s => ({ ...s, isLoading: true }));
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - (days - 1));
    try {
      const workouts = await provider.getWorkoutSummaries(start, end);
      // Spočítej strain za každý den v okně.
      const points: TrendPoint[] = [];
      for (let i = 0; i < days; i++) {
        const day = new Date(start);
        day.setDate(day.getDate() + i);
        const dayStart = new Date(day);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(day);
        dayEnd.setHours(23, 59, 59, 999);
        const dayWorkouts = workouts.filter(w => {
          const t = new Date(w.startedAt).getTime();
          return t >= dayStart.getTime() && t <= dayEnd.getTime();
        });
        const strain = computeDailyStrain({ plannedSession: null, todaysWorkouts: dayWorkouts });
        // 0 day = no workout, ratio = null (mezerа v grafu);
        // anything > 0 = real strain
        const value = strain.workoutCount > 0 ? strain.score : null;
        points.push({ date: toDateKey(day), value });
      }
      setState({ data: points, isLoading: false, refresh });
    } catch {
      setState({ data: [], isLoading: false, refresh });
    }
  }, [provider, days]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return state;
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// re-export helper for tests
export const __test__ = {
  strainPointForWorkouts(workouts: WorkoutSummary[]): number | null {
    const strain = computeDailyStrain({ plannedSession: null, todaysWorkouts: workouts });
    return strain.workoutCount > 0 ? strain.score : null;
  },
};
