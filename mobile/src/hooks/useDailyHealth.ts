import { useEffect, useState, useCallback } from 'react';
import { useHealthDataProvider } from './useHealthDataProvider';
import type {
  BodyWeightSample,
  DailyActivitySummary,
  HealthPermissionStatus,
  RestingHeartRateSample,
  SleepSummary,
} from '../lib/health';

export type DailyHealthSnapshot = {
  activity: DailyActivitySummary | null;
  sleep: SleepSummary | null;
  restingHeartRate: RestingHeartRateSample | null;
  latestWeight: BodyWeightSample | null;
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
    latestWeight: null,
    permission: 'not_determined',
    isLoading: true,
    isEmpty: true,
  });

  // Stable date key so the effect doesn't re-run every render with a new Date object.
  const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

  const refresh = useCallback(async () => {
    setSnapshot(s => ({ ...s, isLoading: true }));
    try {
      const [permission, activityList, sleepList, rhr, weight] = await Promise.all([
        provider.getPermissionStatus(),
        provider.getDailyActivityRange(date, date),
        provider.getSleepSummary(date, date),
        provider.getRestingHeartRate(date),
        provider.getLatestBodyWeight(),
      ]);
      const activity = activityList[0] || null;
      const sleep = sleepList[0] || null;
      const isEmpty = !activity && !sleep && !rhr && !weight;
      setSnapshot({
        activity,
        sleep,
        restingHeartRate: rhr,
        latestWeight: weight,
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
