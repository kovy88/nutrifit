import { useEffect, useState } from 'react';
import { useHealthDataProvider } from './useHealthDataProvider';
import { evaluateReadiness, type ReadinessAssessment } from '../lib/coaching/readiness';
import { computePersonalBaselines, type PersonalBaselines } from '../lib/coaching/baselines';
import { computeTrainingLoad, type TrainingLoadAssessment } from '../lib/coaching/trainingLoad';

export type DailyCoachingState = {
  assessment: ReadinessAssessment | null;
  /** 14-day rolling baseline used to make readiness personal. null = not enough data yet. */
  baselines: PersonalBaselines | null;
  /** Training load (ACWR) over 7-day acute / 28-day chronic window. */
  trainingLoad: TrainingLoadAssessment | null;
  isLoading: boolean;
};

/**
 * Reads today's sleep / RHR / HRV from the active provider and runs the
 * readiness assessment. Use on HomeScreen to render a coach card.
 *
 * Falls back to `assessment.level === 'green'` with a "no data" recommendation
 * when the provider returns nothing — coaching never blocks the user, only
 * downgrades intensity when there's clear evidence of poor recovery.
 */
export function useDailyCoaching(date: Date = new Date()): DailyCoachingState {
  const provider = useHealthDataProvider();
  const [state, setState] = useState<DailyCoachingState>({
    assessment: null,
    baselines: null,
    trainingLoad: null,
    isLoading: true,
  });

  // Stable date key so the effect doesn't re-run on every render's new Date.
  const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      // Single 28-day workout query feeds both ACWR + workouts list.
      const chronicStart = new Date(date);
      chronicStart.setDate(chronicStart.getDate() - 28);

      // Fetch today's signals + 14-day baseline + 28-day workouts in parallel.
      const [sleepArr, rhr, hrv, baselines, workouts] = await Promise.all([
        provider.getSleepSummary(date, date),
        provider.getRestingHeartRate(date),
        provider.getHrv(date),
        computePersonalBaselines(provider, { endDate: date, days: 14 }),
        provider.getWorkoutSummaries(chronicStart, date).catch(() => []),
      ]);
      if (cancelled) return;
      const sleep = sleepArr[0] || null;
      const assessment = evaluateReadiness({
        todaySleepMinutes: sleep?.totalMinutes ?? null,
        todayRhrBpm: rhr?.bpm ?? null,
        todayHrvMs: hrv?.ms ?? null,
        baseline: {
          rhrMeanBpm: baselines.rhrMeanBpm,
          hrvMeanMs: baselines.hrvMeanMs,
          sleepMeanMinutes: baselines.sleepMeanMinutes,
        },
      });
      const trainingLoad = computeTrainingLoad({ workouts, endDate: date });
      setState({ assessment, baselines, trainingLoad, isLoading: false });
    }
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, dateKey]);

  return state;
}
