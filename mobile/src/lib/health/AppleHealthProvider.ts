// ── APPLE HEALTH PROVIDER (drop-in real implementation)
//
// Aktivuje se v okamžiku, kdy uživatel doinstaluje native plugin:
//   npx expo install @kingstinct/react-native-healthkit
// + přidá do app.json plugin config + udělá EAS prebuild + build.
// Bez balíčku všechny metody vrátí prázdná data (stejně jako stub), takže
// app v Expo Go neumře — jen "nemá Apple Health".
//
// Pattern: dynamický `import()` v každé metodě, try/catch, fallback na
// prázdnou hodnotu. Žádná hard dependency v package.json — uživatel ji
// přidá až bude chtít HealthKit.
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
//   HKWorkoutType         → WorkoutSummary (kind mapped from activityType)

import { Platform } from 'react-native';
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

/** Singleton init guard — HealthKit must be initialized once before queries. */
let initPromise: Promise<any | null> | null = null;

function isUnitTestRuntime(): boolean {
  return Boolean((globalThis as any).__NUTRIFIT_TEST__);
}

async function loadHealthKit(): Promise<any | null> {
  if (Platform.OS !== 'ios') return null;
  if (isUnitTestRuntime()) return null;
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

/** Mapování HKWorkoutActivityType → WorkoutKind.
 *  Kingstinct package vrací string identifier (např. 'HKWorkoutActivityTypeRunning'). */
function mapWorkoutKind(activityType: string | number | undefined): WorkoutKind {
  const key = String(activityType ?? '').toLowerCase();
  if (key.includes('running')) return 'run';
  if (key.includes('walking')) return 'walk';
  if (key.includes('cycling')) return 'cycle';
  if (key.includes('swimming')) return 'swim';
  if (key.includes('rowing')) return 'rowing';
  if (key.includes('hiit') || key.includes('highintensityintervaltraining')) return 'hiit';
  if (key.includes('functionalstrength')) return 'functional';
  if (key.includes('strength') || key.includes('weightlifting')) return 'strength';
  if (key.includes('yoga')) return 'yoga';
  return 'other';
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
    return Platform.OS === 'ios';
  }

  async isAvailable(): Promise<boolean> {
    const hk = await loadHealthKit();
    if (!hk) return false;
    try {
      return Boolean(await hk.isHealthDataAvailableAsync?.()) || true;
    } catch {
      return false;
    }
  }

  async getPermissionStatus(): Promise<HealthPermissionStatus> {
    const hk = await loadHealthKit();
    if (!hk) return 'unavailable';
    // HealthKit nedovoluje query authorization status pro READ permissions
    // (privacy-by-design — appka neví, co uživatel skrýval). Vrátíme
    // 'not_determined' a UI nechá uživatele kliknout "Povolit".
    return 'not_determined';
  }

  async requestPermissions(types: HealthDataType[]): Promise<HealthPermissionResult> {
    const hk = await loadHealthKit();
    if (!hk) return { status: 'unavailable', granted: [], denied: types };
    try {
      const readIds = types.map(t => HK_READ_IDS[t]).filter(Boolean);
      await hk.requestAuthorization?.(readIds, []);
      // HealthKit nevrátí, které typy byly povoleny — předpokládáme granted.
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
        const opts = { from: dayStart, to: dayEnd };
        const [steps, active, basal, distM] = await Promise.all([
          sumQuantity(hk, HK_READ_IDS.steps, opts),
          sumQuantity(hk, HK_READ_IDS.activeEnergy, opts),
          sumQuantity(hk, HK_READ_IDS.basalEnergy, opts),
          sumQuantity(hk, HK_READ_IDS.distanceWalkingRunning, opts),
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
      const samples = (await hk.queryWorkouts?.({ from: start, to: end })) ?? [];
      return samples.map((w: any): WorkoutSummary => ({
        id: `apple-${w.uuid ?? w.startDate}`,
        externalId: w.uuid,
        startedAt: new Date(w.startDate).toISOString(),
        endedAt: new Date(w.endDate).toISOString(),
        kind: mapWorkoutKind(w.workoutActivityType),
        durationMinutes: Math.round(((w.duration ?? 0) as number) / 60),
        distanceKm: w.totalDistance ? Math.round((w.totalDistance / 1000) * 100) / 100 : undefined,
        activeEnergyKcal: w.totalEnergyBurned ? Math.round(w.totalEnergyBurned) : undefined,
        avgHeartRate: w.metadata?.HKAverageHeartRate ? Math.round(w.metadata.HKAverageHeartRate) : undefined,
        maxHeartRate: w.metadata?.HKMaximumHeartRate ? Math.round(w.metadata.HKMaximumHeartRate) : undefined,
        source: 'apple_health',
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
      const sample = await hk.queryQuantitySamples?.(HK_READ_IDS.bodyMass, {
        from: cutoff, to: new Date(), limit: 1, ascending: false,
      });
      const latest = Array.isArray(sample) ? sample[0] : sample;
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
        from: start, to: end, ascending: true,
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
        from: queryStart, to: end,
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
        const v = s.value ?? s.categoryValue;
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
        from: start, to: end, ascending: false, limit: 1,
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
        from: start, to: end, ascending: false, limit: 1,
      })) ?? [];
      const latest = samples[0];
      if (!latest) return null;
      // HKQuantityTypeIdentifierHeartRateVariabilitySDNN returns SDNN in seconds.
      // Multiply by 1000 to get milliseconds.
      const ms = Math.round((latest.quantity ?? 0) * 1000);
      return { date: dateKey(date), ms, metric: 'sdnn', source: 'apple_health' };
    } catch {
      return null;
    }
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function sumQuantity(hk: any, identifier: string, opts: { from: Date; to: Date }): Promise<number> {
  try {
    const samples = (await hk.queryQuantitySamples?.(identifier, opts)) ?? [];
    let total = 0;
    for (const s of samples) total += s.quantity ?? 0;
    return total;
  } catch {
    return 0;
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
