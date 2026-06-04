import { useEffect, useState } from 'react';
import { useHealthDataProvider } from './useHealthDataProvider';
import { evaluateReadiness, type ReadinessAssessment } from '../lib/coaching/readiness';
import { computePersonalBaselines, type PersonalBaselines } from '../lib/coaching/baselines';
import { computeTrainingLoad, type TrainingLoadAssessment } from '../lib/coaching/trainingLoad';
import { computeDailyStrain, type StrainAssessment } from '../lib/coaching/strainScore';
import { computeSleepDebt, computeRecoveryDebt, type SleepDebtSummary, type RecoveryDebtSummary } from '../lib/coaching/debtTracker';
import { useTrenr } from '../context/TrenrContext';
import { useLanguage } from '../context/LanguageContext';

export type DailyCoachingState = {
  assessment: ReadinessAssessment | null;
  /** 14-day rolling baseline used to make readiness personal. null = not enough data yet. */
  baselines: PersonalBaselines | null;
  /** Training load (ACWR) over 7-day acute / 28-day chronic window. */
  trainingLoad: TrainingLoadAssessment | null;
  /** Today's strain score 0–21 (Whoop-style). */
  strain: StrainAssessment | null;
  /** Cumulative sleep debt (14d). */
  sleepDebt: SleepDebtSummary | null;
  /** Cumulative recovery debt (14d). */
  recoveryDebt: RecoveryDebtSummary | null;
  /** Raw today's signals — feeds the daily coach recommendation. */
  today: { sleepMinutes: number | null; rhrBpm: number | null; hrvMs: number | null };
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
  const { locale } = useLanguage();
  const { currentSession: todaySession } = useTrenr();
  const [state, setState] = useState<DailyCoachingState>({
    assessment: null,
    baselines: null,
    trainingLoad: null,
    strain: null,
    sleepDebt: null,
    recoveryDebt: null,
    today: { sleepMinutes: null, rhrBpm: null, hrvMs: null },
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
        locale,
        todaySleepMinutes: sleep?.totalMinutes ?? null,
        todayRhrBpm: rhr?.bpm ?? null,
        todayHrvMs: hrv?.ms ?? null,
        baseline: {
          rhrMeanBpm: baselines.rhrMeanBpm,
          hrvMeanMs: baselines.hrvMeanMs,
          sleepMeanMinutes: baselines.sleepMeanMinutes,
        },
      });
      const trainingLoad = computeTrainingLoad({ workouts, endDate: date, locale });
      // Today's workouts: filter the 28-day list to only today
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);
      const todaysWorkouts = workouts.filter(w => {
        const t = new Date(w.startedAt).getTime();
        return t >= dayStart.getTime() && t <= dayEnd.getTime();
      });
      const strain = computeDailyStrain({ plannedSession: todaySession, todaysWorkouts, locale });

      // Sleep + recovery debt — 14-day trackers compiled efficiently in a single batch query.
      const debtStart = new Date(date);
      debtStart.setDate(debtStart.getDate() - 13);
      const [sleepRange, recoveryRange] = await Promise.all([
        provider.getSleepSummary(debtStart, date).catch(() => []),
        provider.getRecoveryInputs(debtStart, date).catch(() => []),
      ]);
      if (cancelled) return;

      const sleepDebt = computeSleepDebt({ sleeps: sleepRange.slice(0, 14), days: 14 });
      // Build per-day readiness levels for recovery debt
      const readinessLevels: ('green' | 'yellow' | 'red')[] = [];
      for (let i = 0; i < 14; i++) {
        const d = new Date(debtStart);
        d.setDate(d.getDate() + i);
        const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const daySleep = sleepRange.find(s => s.date === dateKey);
        const dayRecovery = recoveryRange.find(r => r.date === dateKey);

        const r = evaluateReadiness({
          todaySleepMinutes: daySleep?.totalMinutes ?? null,
          todayHrvMs: dayRecovery?.todayHrvMs ?? null,
          todayRhrBpm: dayRecovery?.todayRhrBpm ?? null,
          baseline: {
            rhrMeanBpm: baselines.rhrMeanBpm,
            hrvMeanMs: baselines.hrvMeanMs,
            sleepMeanMinutes: baselines.sleepMeanMinutes,
          },
        });
        readinessLevels.push(r.level);
      }
      const recoveryDebt = computeRecoveryDebt({ readinessLevels, days: 14 });

      setState({
        assessment,
        baselines,
        trainingLoad,
        strain,
        sleepDebt,
        recoveryDebt,
        today: { sleepMinutes: sleep?.totalMinutes ?? null, rhrBpm: rhr?.bpm ?? null, hrvMs: hrv?.ms ?? null },
        isLoading: false,
      });
    }
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, dateKey, locale, todaySession?.kind, todaySession?.durationMinutes, todaySession?.intensity]);

  return state;
}
