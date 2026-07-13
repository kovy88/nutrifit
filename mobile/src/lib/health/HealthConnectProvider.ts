// ── HEALTH CONNECT PROVIDER (Android)
//
// Google Health Connect je unified Android API (preinstalled na novějších
// telefonech, na starších se instaluje z Play Store). Agreguje data ze
// Samsung Health, Fitbitu, Garmin Connect, Zepp App (pokud uživatel zapne
// sync), Withings, Polar Flow, atd. — jedna implementace tady odemkne
// všechny tyhle zdroje na Androidu najednou.
//
// Používá `react-native-health-connect` (matinzm), nativní modul — vyžaduje
// EAS Build (Expo Go nemá native pluginy). Config plugin + Android manifest
// permissions už jsou v app.json.
//
// Pro release na Play Store nutné odeslat Google Play "Health Data
// Disclosure Form" s zdůvodněním, k čemu data potřebujeme — to je mimo
// scope tohoto souboru.
//
// BEZ přístupu k reálnému Android zařízení s Health Connect nainstalovaným
// nejde tohle field-testovat živě — field names/shapes ověřené proti
// balíčku `react-native-health-connect`'s vlastním TS typům (zdroj pravdy,
// ne dokumentace, která může být stale). Viz TODO.md.

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
import type { RecoveryInputs } from '../../types/coach';
import { toDateKey } from '../../utils/nutrition';

/** Lazily import the native module — importing it on iOS/web would throw
 *  (the package only supports Android), so this stays null there and every
 *  method below treats that as "unavailable" rather than crashing. Dynamic
 *  `import()` (rather than `require()`) so the load stays deferred/catchable
 *  while also being mockable in tests via `vi.mock`. */
async function loadHealthConnect(): Promise<typeof import('react-native-health-connect') | null> {
  if (Platform.OS !== 'android') return null;
  try {
    return await import('react-native-health-connect');
  } catch {
    return null;
  }
}

/** Health Connect record shapes we read. Kept local/minimal rather than
 *  importing the package's full type surface, matching how AppleHealthProvider
 *  and StravaProvider each define their own narrow response types. */
type HcInterval = { startTime: string; endTime: string };
type HcStepsRecord = HcInterval & { count: number };
type HcEnergyRecord = HcInterval & { energy: { value: number; unit: string } };
type HcDistanceRecord = HcInterval & { distance: { value: number; unit: string } };
type HcExerciseRecord = HcInterval & { metadata?: { id?: string }; exerciseType: number };
type HcWeightRecord = { time: string; weight: { value: number; unit: string } };
type HcSleepStage = { startTime: string; endTime: string; stage: number };
type HcSleepRecord = HcInterval & { stages?: HcSleepStage[] };
type HcRestingHrRecord = { time: string; beatsPerMinute: number };
type HcHrvRecord = { time: string; heartRateVariabilityMillis: number };

const SLEEP_STAGE = { AWAKE: 1, SLEEPING: 2, OUT_OF_BED: 3, LIGHT: 4, DEEP: 5, REM: 6 };
const WAKE_STAGES = new Set([SLEEP_STAGE.AWAKE, SLEEP_STAGE.OUT_OF_BED]);

/** Health Connect's ExerciseType is a big numeric enum — map the common
 *  ones, default to 'other' for anything unmapped. */
const EXERCISE_TYPE_TO_KIND: Record<number, WorkoutKind> = {
  56: 'run', 57: 'run',                 // RUNNING, RUNNING_TREADMILL
  79: 'walk', 37: 'walk',                // WALKING, HIKING
  8: 'cycle', 9: 'cycle',                // BIKING, BIKING_STATIONARY
  73: 'swim', 74: 'swim',                // SWIMMING_OPEN_WATER, SWIMMING_POOL
  70: 'strength', 81: 'strength', 6: 'strength', 17: 'strength', 67: 'strength', // STRENGTH_TRAINING, WEIGHTLIFTING, BENCH_PRESS, DEADLIFT, SQUAT
  36: 'hiit',                             // HIGH_INTENSITY_INTERVAL_TRAINING
  83: 'yoga', 48: 'yoga', 71: 'yoga',    // YOGA, PILATES, STRETCHING
  13: 'functional', 10: 'functional', 26: 'functional', 12: 'functional', 40: 'functional', 49: 'functional', // CALISTHENICS, BOOT_CAMP, EXERCISE_CLASS, BURPEE, JUMPING_JACK, PLANK
  53: 'rowing', 54: 'rowing',            // ROWING, ROWING_MACHINE
};

function mapExerciseType(exerciseType: number): WorkoutKind {
  return EXERCISE_TYPE_TO_KIND[exerciseType] ?? 'other';
}

function durationMinutes(start: string, end: string): number {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000);
}

export class HealthConnectProvider implements HealthDataProvider {
  readonly name = 'health_connect' as const;

  /** Static gate: jen Android, aniž bychom načítali native modul. */
  static isSupported(): boolean {
    return Platform.OS === 'android';
  }

  private async ensureInitialized(): Promise<typeof import('react-native-health-connect') | null> {
    const hc = await loadHealthConnect();
    if (!hc) return null;
    try {
      const status = await hc.getSdkStatus();
      if (status !== hc.SdkAvailabilityStatus.SDK_AVAILABLE) return null;
      const ok = await hc.initialize();
      return ok ? hc : null;
    } catch {
      return null;
    }
  }

  async isAvailable(): Promise<boolean> {
    return (await this.ensureInitialized()) !== null;
  }

  async getPermissionStatus(): Promise<HealthPermissionStatus> {
    const hc = await this.ensureInitialized();
    if (!hc) return 'unavailable';
    try {
      const granted = await hc.getGrantedPermissions();
      return granted.length > 0 ? 'granted' : 'not_determined';
    } catch {
      return 'unavailable';
    }
  }

  async requestPermissions(types: HealthDataType[]): Promise<HealthPermissionResult> {
    const hc = await this.ensureInitialized();
    if (!hc) return { status: 'unavailable', granted: [], denied: types };
    const recordTypeFor: Partial<Record<HealthDataType, string>> = {
      steps: 'Steps',
      activeEnergy: 'ActiveCaloriesBurned',
      basalEnergy: 'TotalCaloriesBurned',
      distanceWalkingRunning: 'Distance',
      heartRate: 'HeartRate',
      restingHeartRate: 'RestingHeartRate',
      hrv: 'HeartRateVariabilityRmssd',
      bodyMass: 'Weight',
      sleepAnalysis: 'SleepSession',
      workout: 'ExerciseSession',
    };
    const wanted = types.map(t => recordTypeFor[t]).filter((v): v is string => !!v);
    try {
      const granted = await hc.requestPermission(wanted.map(recordType => ({ accessType: 'read' as const, recordType: recordType as never })));
      const grantedTypes = types.filter(t => granted.some(g => 'recordType' in g && g.recordType === recordTypeFor[t]));
      return {
        status: grantedTypes.length === types.length ? 'granted' : grantedTypes.length > 0 ? 'partial' : 'denied',
        granted: grantedTypes,
        denied: types.filter(t => !grantedTypes.includes(t)),
      };
    } catch {
      return { status: 'unavailable', granted: [], denied: types };
    }
  }

  private async readRange<T>(hc: NonNullable<Awaited<ReturnType<HealthConnectProvider['ensureInitialized']>>>, recordType: string, start: Date, end: Date): Promise<T[]> {
    const out: T[] = [];
    let pageToken: string | undefined;
    do {
      let result: { records: unknown[]; pageToken?: string };
      try {
        result = await hc.readRecords(recordType as never, {
          timeRangeFilter: { operator: 'between', startTime: start.toISOString(), endTime: end.toISOString() },
          ...(pageToken ? { pageToken } : {}),
        });
      } catch {
        return out;
      }
      out.push(...(result.records as T[]));
      pageToken = result.pageToken;
    } while (pageToken);
    return out;
  }

  async getDailyActivityRange(start: Date, end: Date): Promise<DailyActivitySummary[]> {
    const hc = await this.ensureInitialized();
    if (!hc) return [];
    const [steps, activeCal, distance] = await Promise.all([
      this.readRange<HcStepsRecord>(hc, 'Steps', start, end),
      this.readRange<HcEnergyRecord>(hc, 'ActiveCaloriesBurned', start, end),
      this.readRange<HcDistanceRecord>(hc, 'Distance', start, end),
    ]);

    const byDate = new Map<string, DailyActivitySummary>();
    const bucket = (dateKey: string) => {
      let entry = byDate.get(dateKey);
      if (!entry) {
        entry = { date: dateKey, steps: 0, activeEnergyKcal: 0, distanceKm: 0, source: 'health_connect' };
        byDate.set(dateKey, entry);
      }
      return entry;
    };
    for (const r of steps) bucket(toDateKey(r.startTime)).steps += r.count;
    for (const r of activeCal) bucket(toDateKey(r.startTime)).activeEnergyKcal += energyToKcal(r.energy);
    for (const r of distance) {
      const entry = bucket(toDateKey(r.startTime));
      entry.distanceKm = (entry.distanceKm ?? 0) + lengthToKm(r.distance);
    }
    return Array.from(byDate.values());
  }

  async getWorkoutSummaries(start: Date, end: Date): Promise<WorkoutSummary[]> {
    const hc = await this.ensureInitialized();
    if (!hc) return [];
    const records = await this.readRange<HcExerciseRecord>(hc, 'ExerciseSession', start, end);
    return records.map(r => ({
      id: `health_connect-${r.metadata?.id ?? `${r.startTime}`}`,
      externalId: r.metadata?.id,
      startedAt: r.startTime,
      endedAt: r.endTime,
      kind: mapExerciseType(r.exerciseType),
      durationMinutes: durationMinutes(r.startTime, r.endTime),
      source: 'health_connect' as const,
    }));
  }

  async getLatestBodyWeight(): Promise<BodyWeightSample | null> {
    const hc = await this.ensureInitialized();
    if (!hc) return null;
    try {
      const result = await hc.readRecords('Weight' as never, {
        timeRangeFilter: { operator: 'before', endTime: new Date().toISOString() },
        ascendingOrder: false,
        pageSize: 1,
      });
      const [record] = result.records as unknown as HcWeightRecord[];
      if (!record) return null;
      return { date: toDateKey(record.time), weightKg: massToKg(record.weight), source: 'health_connect' };
    } catch {
      return null;
    }
  }

  async getBodyWeightRange(start: Date, end: Date): Promise<BodyWeightSample[]> {
    const hc = await this.ensureInitialized();
    if (!hc) return [];
    const records = await this.readRange<HcWeightRecord>(hc, 'Weight', start, end);
    return records.map(r => ({ date: toDateKey(r.time), weightKg: massToKg(r.weight), source: 'health_connect' as const }));
  }

  async getSleepSummary(start: Date, end: Date): Promise<SleepSummary[]> {
    const hc = await this.ensureInitialized();
    if (!hc) return [];
    const records = await this.readRange<HcSleepRecord>(hc, 'SleepSession', start, end);
    return records.map(r => summarizeSleep(r));
  }

  async getRestingHeartRate(date: Date): Promise<RestingHeartRateSample | null> {
    const hc = await this.ensureInitialized();
    if (!hc) return null;
    const dayEnd = new Date(date);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const records = await this.readRange<HcRestingHrRecord>(hc, 'RestingHeartRate', date, dayEnd);
    if (!records.length) return null;
    const latest = records[records.length - 1];
    return { date: toDateKey(latest.time), bpm: Math.round(latest.beatsPerMinute), source: 'health_connect' };
  }

  async getHrv(date: Date): Promise<HrvSample | null> {
    const hc = await this.ensureInitialized();
    if (!hc) return null;
    const dayEnd = new Date(date);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const records = await this.readRange<HcHrvRecord>(hc, 'HeartRateVariabilityRmssd', date, dayEnd);
    if (!records.length) return null;
    const latest = records[records.length - 1];
    // Health Connect reports RMSSD, not SDNN (Apple Health's metric).
    return { date: toDateKey(latest.time), ms: Math.round(latest.heartRateVariabilityMillis), metric: 'rmssd', source: 'health_connect' };
  }

  async getRecoveryInputs(start: Date, end: Date): Promise<RecoveryInputs[]> {
    const hc = await this.ensureInitialized();
    if (!hc) return [];
    const [sleepRecords, rhrRecords, hrvRecords] = await Promise.all([
      this.readRange<HcSleepRecord>(hc, 'SleepSession', start, end),
      this.readRange<HcRestingHrRecord>(hc, 'RestingHeartRate', start, end),
      this.readRange<HcHrvRecord>(hc, 'HeartRateVariabilityRmssd', start, end),
    ]);

    const sleepByDate = new Map(sleepRecords.map(r => [toDateKey(r.endTime), summarizeSleep(r)]));
    const rhrByDate = new Map<string, number>();
    for (const r of rhrRecords) rhrByDate.set(toDateKey(r.time), Math.round(r.beatsPerMinute));
    const hrvByDate = new Map<string, number>();
    for (const r of hrvRecords) hrvByDate.set(toDateKey(r.time), Math.round(r.heartRateVariabilityMillis));

    const dates = new Set([...sleepByDate.keys(), ...rhrByDate.keys(), ...hrvByDate.keys()]);
    return Array.from(dates).map(date => ({
      date,
      todaySleepMinutes: sleepByDate.get(date)?.totalMinutes ?? null,
      todayRhrBpm: rhrByDate.get(date) ?? null,
      todayHrvMs: hrvByDate.get(date) ?? null,
    }));
  }
}

/** Sleep "for date X" = sleep ending on date X (wake-up date), matching the
 *  convention AppleHealthProvider documents — not the bedtime/start date. */
function summarizeSleep(r: HcSleepRecord): SleepSummary {
  const totalSessionMinutes = durationMinutes(r.startTime, r.endTime);
  if (!r.stages?.length) {
    return { date: toDateKey(r.endTime), totalMinutes: totalSessionMinutes, source: 'health_connect' };
  }
  let deep = 0;
  let rem = 0;
  let awake = 0;
  let asleep = 0;
  for (const stage of r.stages) {
    const minutes = durationMinutes(stage.startTime, stage.endTime);
    if (stage.stage === SLEEP_STAGE.DEEP) deep += minutes;
    else if (stage.stage === SLEEP_STAGE.REM) rem += minutes;
    if (WAKE_STAGES.has(stage.stage)) awake += minutes;
    else asleep += minutes;
  }
  return {
    date: toDateKey(r.endTime),
    totalMinutes: asleep,
    deepMinutes: deep,
    remMinutes: rem,
    awakeMinutes: awake,
    efficiency: totalSessionMinutes > 0 ? Math.min(asleep / totalSessionMinutes, 1) : undefined,
    source: 'health_connect',
  };
}

function energyToKcal(energy: { value: number; unit: string }): number {
  if (energy.unit === 'kilocalories') return energy.value;
  if (energy.unit === 'calories') return energy.value / 1000;
  if (energy.unit === 'kilojoules') return energy.value / 4.184;
  if (energy.unit === 'joules') return energy.value / 4184;
  return energy.value;
}

function lengthToKm(length: { value: number; unit: string }): number {
  if (length.unit === 'kilometers') return length.value;
  if (length.unit === 'meters') return length.value / 1000;
  if (length.unit === 'miles') return length.value * 1.60934;
  return length.value;
}

function massToKg(mass: { value: number; unit: string }): number {
  if (mass.unit === 'kilograms') return mass.value;
  if (mass.unit === 'grams') return mass.value / 1000;
  if (mass.unit === 'pounds') return mass.value * 0.453592;
  if (mass.unit === 'ounces') return mass.value * 0.0283495;
  if (mass.unit === 'milligrams') return mass.value / 1_000_000;
  return mass.value;
}
