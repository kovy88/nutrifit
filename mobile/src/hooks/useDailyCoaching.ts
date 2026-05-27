import { useEffect, useState } from 'react';
import { useHealthDataProvider } from './useHealthDataProvider';
import { evaluateReadiness, type ReadinessAssessment } from '../lib/coaching/readiness';

export type DailyCoachingState = {
  assessment: ReadinessAssessment | null;
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
  const [state, setState] = useState<DailyCoachingState>({ assessment: null, isLoading: true });

  // Stable date key so the effect doesn't re-run on every render's new Date.
  const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [sleepArr, rhr, hrv] = await Promise.all([
        provider.getSleepSummary(date, date),
        provider.getRestingHeartRate(date),
        provider.getHrv(date),
      ]);
      if (cancelled) return;
      const sleep = sleepArr[0] || null;
      const assessment = evaluateReadiness({
        todaySleepMinutes: sleep?.totalMinutes ?? null,
        todayRhrBpm: rhr?.bpm ?? null,
        todayHrvMs: hrv?.ms ?? null,
      });
      setState({ assessment, isLoading: false });
    }
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, dateKey]);

  return state;
}
