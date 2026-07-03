import { useEffect, useState, useCallback } from 'react';
import { useHealthDataProvider } from './useHealthDataProvider';
import type {
  BodyWeightSample,
  DailyActivitySummary,
  HealthDataSource,
  HealthDataSummary,
  HealthPermissionStatus,
  HrvSample,
  RestingHeartRateSample,
  SleepSummary,
  WorkoutSummary,
} from '../lib/health';
import { saveDailyHealthSummaryForDate } from '../services/storage';
import { toDateKey } from '../utils/nutrition';

export type DailyHealthSnapshot = {
  activity: DailyActivitySummary | null;
  sleep: SleepSummary | null;
  restingHeartRate: RestingHeartRateSample | null;
  hrv: HrvSample | null;
  latestWeight: BodyWeightSample | null;
  workouts: WorkoutSummary[];
  permission: HealthPermissionStatus;
  isLoading: boolean;
  /** True when nothing was returned — UI can show empty-state CTA. */
  isEmpty: boolean;
  /** Manually re-fetch (e.g. pull-to-refresh). */
  refresh: () => Promise<void>;
};

/**
 * Reads today's health snapshot from the active HealthDataProvider.
 *
 * Returns null fields when the provider has nothing for the day (typical for
 * Manual on fresh install). UI is responsible for showing manual-entry CTAs
 * when `isEmpty` is true.
 */
export function useDailyHealth(date: Date = new Date()): DailyHealthSnapshot {
  const provider = useHealthDataProvider();
  const [snapshot, setSnapshot] = useState<Omit<DailyHealthSnapshot, 'refresh'>>({
    activity: null,
    sleep: null,
    restingHeartRate: null,
    hrv: null,
    latestWeight: null,
    workouts: [],
    permission: 'not_determined',
    isLoading: true,
    isEmpty: true,
  });

  // Stable date key so the effect doesn't re-run every render with a new Date object.
  const dateKey = toDateKey(date);

  const refresh = useCallback(async () => {
    setSnapshot(s => ({ ...s, isLoading: true }));
    try {
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);
      const [permission, activityList, sleepList, rhr, hrv, weight, workouts] = await Promise.all([
        provider.getPermissionStatus(),
        provider.getDailyActivityRange(dayStart, dayEnd),
        provider.getSleepSummary(dayStart, dayEnd),
        provider.getRestingHeartRate(date),
        provider.getHrv(date),
        provider.getLatestBodyWeight(),
        provider.getWorkoutSummaries(dayStart, dayEnd),
      ]);
      const activity = activityList[0] || null;
      const sleep = sleepList[0] || null;
      const isEmpty = !activity && !sleep && !rhr && !hrv && !weight && workouts.length === 0;
      const now = new Date().toISOString();
      const summary = buildHealthDataSummary({
        date: dateKey,
        activity,
        sleep,
        restingHeartRate: rhr,
        hrv,
        latestWeight: weight,
        workouts,
        now,
      });
      void saveDailyHealthSummaryForDate(dateKey, summary);
      setSnapshot({
        activity,
        sleep,
        restingHeartRate: rhr,
        hrv,
        latestWeight: weight,
        workouts,
        permission,
        isLoading: false,
        isEmpty,
      });
    } catch {
      // Provider should never throw on missing data, but be defensive.
      setSnapshot(s => ({ ...s, isLoading: false }));
    }
    // We intentionally close over the captured `date` from outer scope; dateKey is
    // the effective dep that controls when we re-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, dateKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...snapshot, refresh };
}

function buildHealthDataSummary(input: {
  date: string;
  activity: DailyActivitySummary | null;
  sleep: SleepSummary | null;
  restingHeartRate: RestingHeartRateSample | null;
  hrv: HrvSample | null;
  latestWeight: BodyWeightSample | null;
  workouts: WorkoutSummary[];
  now: string;
}): HealthDataSummary {
  const sources = uniqueSources([
    input.activity?.source,
    input.sleep?.source,
    input.restingHeartRate?.source,
    input.hrv?.source,
    input.latestWeight?.source,
    ...input.workouts.map(w => w.source),
  ]);
  const completeness = {
    activity: Boolean(input.activity),
    workouts: input.workouts.length > 0,
    sleep: Boolean(input.sleep),
    restingHeartRate: Boolean(input.restingHeartRate),
    hrv: Boolean(input.hrv),
    bodyWeight: Boolean(input.latestWeight),
  };
  const objectiveCount = [
    completeness.sleep,
    completeness.restingHeartRate,
    completeness.hrv,
  ].filter(Boolean).length;

  return {
    date: input.date,
    activity: input.activity,
    sleep: input.sleep,
    restingHeartRate: input.restingHeartRate,
    hrv: input.hrv,
    latestWeight: input.latestWeight,
    workouts: input.workouts,
    sources,
    completeness,
    confidence: objectiveCount >= 3 ? 'high' : objectiveCount >= 2 ? 'medium' : 'low',
    createdAt: input.now,
    updatedAt: input.now,
  };
}

function uniqueSources(values: (HealthDataSource | undefined)[]): HealthDataSource[] {
  return Array.from(new Set(values.filter((v): v is HealthDataSource => Boolean(v))));
}
