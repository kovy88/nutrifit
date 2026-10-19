// ── APPLE HEALTH PROVIDER (real implementation, backed by @kingstinct/react-native-healthkit)
//
// Only works in a dev-client / EAS build with the HealthKit native module compiled in —
// in Expo Go (no native module) or in unit tests every method falls back to empty data.
//
// Pattern: dynamický `import()` v každé metodě, try/catch, fallback na
// prázdnou hodnotu — takže i kdyby se native modul nepodařilo nahrát,
// app nikdy nespadne, jen "nemá Apple Health".
//
// Two HealthKit quirks this file works around:
//   1. Read-permission grant/deny is never revealed to the app (Apple's
//      privacy design) — `getPermissionStatus()` can't ask HealthKit, so we
//      persist a local "did the user complete the request flow" flag instead.
//   2. `queryQuantitySamples` etc. default to the device's preferred unit
//      (e.g. lbs vs kg) unless you pass an explicit `unit` — every query below
//      pins a canonical HealthKit unit string so values never depend on the
//      user's Health app locale settings.
//
// Mapování pro reference:
//   stepCount             → DailyActivitySummary.steps
//   activeEnergyBurned    → DailyActivitySummary.activeEnergyKcal
//   basalEnergyBurned     → DailyActivitySummary.basalEnergyKcal
//   distanceWalkingRunning → DailyActivitySummary.distanceKm (m → km)
//   sleepAnalysis         → SleepSummary (asleep states aggregated per night)
//   restingHeartRate      → RestingHeartRateSample
//   heartRateVariabilitySDNN → HrvSample (metric: 'sdnn')
//   bodyMass              → BodyWeightSample (kg)
//   workout               → WorkoutSummary (kind mapped from numeric activityType)

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { HealthDataProvider } from './HealthDataProvider';
import type {
  BodyWeightSample,
  DailyActivitySummary,
  HealthDataType,
  HealthPermissionResult,
  HealthPermissionStatus,
  HrvSample,
  RestingHeartRateSample,
  SleepSummary,
  WorkoutKind,
  WorkoutSummary,
} from '../../types/health';
import type { RecoveryInputs } from '../../types/coach';

/** Singleton init guard — HealthKit must be initialized once before queries. */
let initPromise: Promise<any | null> | null = null;

/** Persisted once `requestAuthorization` has been called successfully — see
 *  the file-header note on why we can't just ask HealthKit for read status. */
const REQUESTED_KEY = 'nutrifit.appleHealth.requested.v1';

function isUnitTestRuntime(): boolean {
  return Boolean((globalThis as any).__NUTRIFIT_TEST__);
}

function isExpoGoRuntime(): boolean {
  try {
    // Lazy require (not a static import): evaluating expo-constants' module
    // scope throws outside a real Expo/RN runtime (e.g. under Vitest), so this
    // must stay behind a try/catch instead of a top-level import.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = require('expo-constants').default;
    return Constants?.appOwnership === 'expo';
  } catch {
    return false;
  }
}

async function loadHealthKit(): Promise<any | null> {
  if (Platform.OS !== 'ios') return null;
  if (isUnitTestRuntime()) return null;
  if (isExpoGoRuntime()) return null;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      // @ts-ignore — package nemusí být nainstalovaný v node_modules (optional native dep)
      const mod = await import('@kingstinct/react-native-healthkit');
      if (mod?.default) return mod.default;
      return mod;
    } catch {
      return null;
    }
  })();
  return initPromise;
}

/** Numeric values mirror `WorkoutActivityType` from @kingstinct/react-native-healthkit.
 *  Hardcoded (not imported) so this file never pulls a runtime value out of the
 *  package — only `import type` above, to keep Expo Go from ever touching the
 *  native module eagerly. */
const WORKOUT_KIND_BY_ACTIVITY_TYPE: Record<number, WorkoutKind> = {
  13: 'cycle', // cycling
  20: 'functional', // functionalStrengthTraining
  35: 'rowing', // rowing
  37: 'run', // running
  46: 'swim', // swimming
  50: 'strength', // traditionalStrengthTraining
  52: 'walk', // walking
  57: 'yoga', // yoga
  63: 'hiit', // highIntensityIntervalTraining
};

function mapWorkoutKind(activityType: number | undefined): WorkoutKind {
  if (activityType == null) return 'other';
  return WORKOUT_KIND_BY_ACTIVITY_TYPE[activityType] ?? 'other';
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** HealthKit identifiers we read, mapped from our HealthDataType union. */
const HK_READ_IDS: Record<HealthDataType, string> = {
  steps:                  'HKQuantityTypeIdentifierStepCount',
  activeEnergy:           'HKQuantityTypeIdentifierActiveEnergyBurned',
  basalEnergy:            'HKQuantityTypeIdentifierBasalEnergyBurned',
  distanceWalkingRunning: 'HKQuantityTypeIdentifierDistanceWalkingRunning',
  heartRate:              'HKQuantityTypeIdentifierHeartRate',
  restingHeartRate:       'HKQuantityTypeIdentifierRestingHeartRate',
  hrv:                    'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  bodyMass:               'HKQuantityTypeIdentifierBodyMass',
  bodyFatPercentage:      'HKQuantityTypeIdentifierBodyFatPercentage',
  sleepAnalysis:          'HKCategoryTypeIdentifierSleepAnalysis',
  workout:                'HKWorkoutTypeIdentifier',
};

export class AppleHealthProvider implements HealthDataProvider {
  readonly name = 'apple_health' as const;

  static isSupported(): boolean {
    return Platform.OS === 'ios' && !isExpoGoRuntime();
  }

  async isAvailable(): Promise<boolean> {
    const hk = await loadHealthKit();
    if (!hk) return false;
    try {
      return Boolean(await hk.isHealthDataAvailableAsync?.());
    } catch {
      return false;
    }
  }

  async getPermissionStatus(): Promise<HealthPermissionStatus> {
    const hk = await loadHealthKit();
    if (!hk) return 'unavailable';
    // HealthKit never reveals read-permission grant/deny state to the app
    // (privacy-by-design). We approximate "connected" with a local flag set
    // once the user has completed the OS permission sheet at least once.
    try {
      const requested = await AsyncStorage.getItem(REQUESTED_KEY);
      return requested ? 'granted' : 'not_determined';
    } catch {
      return 'not_determined';
    }
  }

  async requestPermissions(types: HealthDataType[]): Promise<HealthPermissionResult> {
    const hk = await loadHealthKit();
    if (!hk) return { status: 'unavailable', granted: [], denied: types };
    try {
      const readIds = types.map(t => HK_READ_IDS[t]).filter(Boolean);
      // Apple's requestAuthorization(toShare, toRead) — we only read today, so toShare is empty.
      await hk.requestAuthorization?.([], readIds);
      await AsyncStorage.setItem(REQUESTED_KEY, '1');
      // HealthKit doesn't report which types were actually granted — assume granted.
      return { status: 'granted', granted: types, denied: [] };
    } catch {
      return { status: 'denied', granted: [], denied: types };
    }
  }

  async getDailyActivityRange(start: Date, end: Date): Promise<DailyActivitySummary[]> {
    const hk = await loadHealthKit();
    if (!hk) return [];
    try {
      const dates = enumerateDates(start, end);
      const out: DailyActivitySummary[] = [];
      for (const day of dates) {
        const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(day); dayEnd.setHours(23, 59, 59, 999);
        const [steps, active, basal, distM] = await Promise.all([
          sumQuantity(hk, HK_READ_IDS.steps, dayStart, dayEnd, 'count'),
          sumQuantity(hk, HK_READ_IDS.activeEnergy, dayStart, dayEnd, 'kcal'),
          sumQuantity(hk, HK_READ_IDS.basalEnergy, dayStart, dayEnd, 'kcal'),
          sumQuantity(hk, HK_READ_IDS.distanceWalkingRunning, dayStart, dayEnd, 'm'),
        ]);
        if (steps === 0 && active === 0 && basal === 0 && distM === 0) continue;
        out.push({
          date: dateKey(day),
          steps: Math.round(steps),
          activeEnergyKcal: Math.round(active),
          basalEnergyKcal: basal ? Math.round(basal) : undefined,
          distanceKm: distM ? Math.round((distM / 1000) * 100) / 100 : undefined,
          source: 'apple_health',
        });
      }
      return out;
    } catch {
      return [];
    }
  }

  async getWorkoutSummaries(start: Date, end: Date): Promise<WorkoutSummary[]> {
    const hk = await loadHealthKit();
    if (!hk) return [];
    try {
      const samples = (await hk.queryWorkoutSamples?.({
        filter: { startDate: start, endDate: end },
        limit: 500,
        energyUnit: 'kcal',
        distanceUnit: 'm',
      })) ?? [];
      return await Promise.all(samples.map(async (w: any): Promise<WorkoutSummary> => {
        const hr = await workoutHeartRateStats(hk, w);
        return {
          id: `apple-${w.uuid}`,
          externalId: w.uuid,
          startedAt: new Date(w.startDate).toISOString(),
          endedAt: new Date(w.endDate).toISOString(),
          kind: mapWorkoutKind(w.workoutActivityType),
          durationMinutes: Math.round((w.duration?.quantity ?? 0) / 60),
          distanceKm: w.totalDistance?.quantity ? Math.round((w.totalDistance.quantity / 1000) * 100) / 100 : undefined,
          activeEnergyKcal: w.totalEnergyBurned?.quantity ? Math.round(w.totalEnergyBurned.quantity) : undefined,
          avgHeartRate: hr.avg,
          maxHeartRate: hr.max,
          source: 'apple_health',
        };
      }));
    } catch {
      return [];
    }
  }

  async getLatestBodyWeight(maxDaysOld = 30): Promise<BodyWeightSample | null> {
    const hk = await loadHealthKit();
    if (!hk) return null;
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - maxDaysOld);
      const samples = (await hk.queryQuantitySamples?.(HK_READ_IDS.bodyMass, {
        filter: { startDate: cutoff, endDate: new Date() },
        unit: 'kg',
        limit: 1,
        ascending: false,
      })) ?? [];
      const latest = samples[0];
      if (!latest) return null;
      return {
        date: dateKey(new Date(latest.endDate ?? latest.startDate)),
        weightKg: Math.round((latest.quantity ?? 0) * 10) / 10,
        source: 'apple_health',
      };
    } catch {
      return null;
    }
  }

  async getBodyWeightRange(start: Date, end: Date): Promise<BodyWeightSample[]> {
    const hk = await loadHealthKit();
    if (!hk) return [];
    try {
      const samples = (await hk.queryQuantitySamples?.(HK_READ_IDS.bodyMass, {
        filter: { startDate: start, endDate: end },
        unit: 'kg',
        limit: 2000,
        ascending: true,
      })) ?? [];
      return samples.map((s: any): BodyWeightSample => ({
        date: dateKey(new Date(s.endDate ?? s.startDate)),
        weightKg: Math.round((s.quantity ?? 0) * 10) / 10,
        source: 'apple_health',
      }));
    } catch {
      return [];
    }
  }

  async getSleepSummary(start: Date, end: Date): Promise<SleepSummary[]> {
    const hk = await loadHealthKit();
    if (!hk) return [];
    try {
      // Apple's convention: sleep "for date X" = sleep ending on date X
      // (i.e. last night). Query a bit before start to catch the night that
      // wrapped midnight.
      const queryStart = new Date(start);
      queryStart.setHours(18, 0, 0, 0);
      queryStart.setDate(queryStart.getDate() - 1);
      const samples = (await hk.queryCategorySamples?.(HK_READ_IDS.sleepAnalysis, {
        filter: { startDate: queryStart, endDate: end },
        limit: 2000,
      })) ?? [];
      // Aggregate per wake-up date.
      const byDate = new Map<string, { total: number; deep: number; rem: number; awake: number }>();
      for (const s of samples) {
        const endDate = new Date(s.endDate);
        const key = dateKey(endDate);
        const dur = (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()) / 60_000;
        const slot = byDate.get(key) ?? { total: 0, deep: 0, rem: 0, awake: 0 };
        // HKCategoryValueSleepAnalysis: 0=in bed, 1=asleep unspecified, 2=awake,
        // 3=core (light), 4=deep, 5=REM
        const v = s.value;
        if (v === 2) slot.awake += dur;
        else if (v === 4) { slot.deep += dur; slot.total += dur; }
        else if (v === 5) { slot.rem += dur; slot.total += dur; }
        else if (v === 1 || v === 3) slot.total += dur;
        byDate.set(key, slot);
      }
      const out: SleepSummary[] = [];
      const startKey = dateKey(start);
      const endKey = dateKey(end);
      for (const [date, slot] of byDate.entries()) {
        if (date < startKey || date > endKey) continue;
        out.push({
          date,
          totalMinutes: Math.round(slot.total),
          deepMinutes: slot.deep ? Math.round(slot.deep) : undefined,
          remMinutes: slot.rem ? Math.round(slot.rem) : undefined,
          awakeMinutes: slot.awake ? Math.round(slot.awake) : undefined,
          efficiency: slot.total > 0 ? Math.round((1 - slot.awake / (slot.total + slot.awake)) * 100) / 100 : undefined,
          source: 'apple_health',
        });
      }
      return out.sort((a, b) => a.date.localeCompare(b.date));
    } catch {
      return [];
    }
  }

  async getRestingHeartRate(date: Date): Promise<RestingHeartRateSample | null> {
    const hk = await loadHealthKit();
    if (!hk) return null;
    try {
      const start = new Date(date); start.setHours(0, 0, 0, 0);
      const end = new Date(date); end.setHours(23, 59, 59, 999);
      const samples = (await hk.queryQuantitySamples?.(HK_READ_IDS.restingHeartRate, {
        filter: { startDate: start, endDate: end },
        unit: 'count/min',
        ascending: false,
        limit: 1,
      })) ?? [];
      const latest = samples[0];
      if (!latest) return null;
      return { date: dateKey(date), bpm: Math.round(latest.quantity ?? 0), source: 'apple_health' };
    } catch {
      return null;
    }
  }

  async getHrv(date: Date): Promise<HrvSample | null> {
    const hk = await loadHealthKit();
    if (!hk) return null;
    try {
      const start = new Date(date); start.setHours(0, 0, 0, 0);
      const end = new Date(date); end.setHours(23, 59, 59, 999);
      const samples = (await hk.queryQuantitySamples?.(HK_READ_IDS.hrv, {
        filter: { startDate: start, endDate: end },
        unit: 'ms',
        ascending: false,
        limit: 1,
      })) ?? [];
      const latest = samples[0];
      if (!latest) return null;
      return { date: dateKey(date), ms: Math.round(latest.quantity ?? 0), metric: 'sdnn', source: 'apple_health' };
    } catch {
      return null;
    }
  }

  async getRecoveryInputs(start: Date, end: Date): Promise<RecoveryInputs[]> {
    const hk = await loadHealthKit();
    if (!hk) return [];

    const sleep = await this.getSleepSummary(start, end);
    const out: RecoveryInputs[] = [];
    const sleepMap = new Map(sleep.map(s => [s.date, s]));

    const dates = enumerateDates(start, end);
    for (const d of dates) {
      const dateStr = dateKey(d);
      const rhr = await this.getRestingHeartRate(d);
      const hrv = await this.getHrv(d);
      const sl = sleepMap.get(dateStr);

      out.push({
        date: dateStr,
        todaySleepMinutes: sl ? sl.totalMinutes : null,
        todayRhrBpm: rhr ? rhr.bpm : null,
        todayHrvMs: hrv ? hrv.ms : null,
        baseline: {
          rhrMeanBpm: 60,
          hrvMeanMs: 45,
          sleepMeanMinutes: 450,
        },
        acwr: 1.0,
        sleepDebtHours: 0,
        recoveryDebt: 0,
      });
    }
    return out;
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function sumQuantity(hk: any, identifier: string, start: Date, end: Date, unit: string): Promise<number> {
  try {
    const samples = (await hk.queryQuantitySamples?.(identifier, {
      filter: { startDate: start, endDate: end },
      unit,
      limit: 2000,
    })) ?? [];
    let total = 0;
    for (const s of samples) total += s.quantity ?? 0;
    return total;
  } catch {
    return 0;
  }
}

/** Average/max heart rate during a workout, via native statistics aggregation
 *  scoped to that workout (no need to pull every raw HR sample into JS). */
async function workoutHeartRateStats(hk: any, workout: any): Promise<{ avg?: number; max?: number }> {
  try {
    const stats = await hk.queryStatisticsForQuantity?.(
      HK_READ_IDS.heartRate,
      ['discreteAverage', 'discreteMax'],
      { filter: { workout }, unit: 'count/min' },
    );
    return {
      avg: stats?.averageQuantity?.quantity != null ? Math.round(stats.averageQuantity.quantity) : undefined,
      max: stats?.maximumQuantity?.quantity != null ? Math.round(stats.maximumQuantity.quantity) : undefined,
    };
  } catch {
    return {};
  }
}

function enumerateDates(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  const stop = new Date(end);
  stop.setHours(0, 0, 0, 0);
  while (d <= stop) {
    dates.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}
