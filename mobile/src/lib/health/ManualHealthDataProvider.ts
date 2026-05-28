// ── MANUAL HEALTH DATA PROVIDER
//
// Pro uživatele bez Apple Health (Android, web, odepření permission).
// Čte ručně zadané hodnoty z AsyncStorage. Datový tvar:
//
//   key                                        value
//   ─────────────────────────────────────────────────────────────────────
//   nutrifit.health.manual.activity.YYYY-MM-DD  DailyActivitySummary
//   nutrifit.health.manual.workouts             WorkoutSummary[]
//   nutrifit.health.manual.sleep.YYYY-MM-DD     SleepSummary
//   nutrifit.health.manual.weights              BodyWeightSample[]  (sorted asc by date)
//   nutrifit.health.manual.rhr.YYYY-MM-DD       RestingHeartRateSample
//   nutrifit.health.manual.hrv.YYYY-MM-DD       HrvSample
//
// Provider má `recordX()` helpery, kterými UI manuální zápisy ukládá.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  BodyWeightSample,
  DailyActivitySummary,
  HealthDataType,
  HealthPermissionResult,
  HealthPermissionStatus,
  HrvSample,
  RestingHeartRateSample,
  SleepSummary,
  WorkoutSummary,
} from '../../types/health';
import type { HealthDataProvider } from './HealthDataProvider';

const PREFIX = 'nutrifit.health.manual';
const KEYS = {
  activity: (date: string) => `${PREFIX}.activity.${date}`,
  workouts: `${PREFIX}.workouts`,
  sleep: (date: string) => `${PREFIX}.sleep.${date}`,
  weights: `${PREFIX}.weights`,
  rhr: (date: string) => `${PREFIX}.rhr.${date}`,
  hrv: (date: string) => `${PREFIX}.hrv.${date}`,
};

export class ManualHealthDataProvider implements HealthDataProvider {
  readonly name = 'manual' as const;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  /** Manuální provider nemá native permissions — vždy granted, ale data
   *  reálně závisí na tom, co uživatel zadal. */
  async getPermissionStatus(): Promise<HealthPermissionStatus> {
    return 'granted';
  }

  async requestPermissions(types: HealthDataType[]): Promise<HealthPermissionResult> {
    return { status: 'granted', granted: types, denied: [] };
  }

  async getDailyActivityRange(start: Date, end: Date): Promise<DailyActivitySummary[]> {
    const out: DailyActivitySummary[] = [];
    for (const date of dateRange(start, end)) {
      const raw = await readJson<DailyActivitySummary>(KEYS.activity(date));
      if (raw) out.push(raw);
    }
    return out;
  }

  async getWorkoutSummaries(start: Date, end: Date): Promise<WorkoutSummary[]> {
    const all = (await readJson<WorkoutSummary[]>(KEYS.workouts)) || [];
    const s = start.getTime();
    const e = end.getTime() + 86_399_999; // include end-of-day
    return all.filter(w => {
      const t = new Date(w.startedAt).getTime();
      return t >= s && t <= e;
    });
  }

  async getLatestBodyWeight(maxDaysOld = 365): Promise<BodyWeightSample | null> {
    const weights = (await readJson<BodyWeightSample[]>(KEYS.weights)) || [];
    if (weights.length === 0) return null;
    // weights stored sorted asc by date; last item is most recent
    const last = weights[weights.length - 1];
    const ageDays = (Date.now() - new Date(last.date).getTime()) / 86_400_000;
    if (ageDays > maxDaysOld) return null;
    return last;
  }

  async getBodyWeightRange(start: Date, end: Date): Promise<BodyWeightSample[]> {
    const all = (await readJson<BodyWeightSample[]>(KEYS.weights)) || [];
    const startKey = toDateKey(start);
    const endKey = toDateKey(end);
    return all.filter(w => w.date >= startKey && w.date <= endKey);
  }

  async getSleepSummary(start: Date, end: Date): Promise<SleepSummary[]> {
    const out: SleepSummary[] = [];
    for (const date of dateRange(start, end)) {
      const raw = await readJson<SleepSummary>(KEYS.sleep(date));
      if (raw) out.push(raw);
    }
    return out;
  }

  async getRestingHeartRate(date: Date): Promise<RestingHeartRateSample | null> {
    return readJson<RestingHeartRateSample>(KEYS.rhr(toDateKey(date)));
  }

  async getHrv(date: Date): Promise<HrvSample | null> {
    return readJson<HrvSample>(KEYS.hrv(toDateKey(date)));
  }

  // ── Write helpers (UI manual input) ────────────────────────────────────────

  async recordActivity(summary: DailyActivitySummary): Promise<void> {
    await AsyncStorage.setItem(KEYS.activity(summary.date), JSON.stringify(summary));
  }

  async recordWorkout(workout: WorkoutSummary): Promise<void> {
    const all = (await readJson<WorkoutSummary[]>(KEYS.workouts)) || [];
    // De-dup by id
    const next = all.filter(w => w.id !== workout.id).concat(workout);
    next.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    await AsyncStorage.setItem(KEYS.workouts, JSON.stringify(next));
  }

  async recordSleep(summary: SleepSummary): Promise<void> {
    await AsyncStorage.setItem(KEYS.sleep(summary.date), JSON.stringify(summary));
  }

  async recordWeight(sample: BodyWeightSample): Promise<void> {
    const all = (await readJson<BodyWeightSample[]>(KEYS.weights)) || [];
    const next = all.filter(w => w.date !== sample.date).concat(sample);
    next.sort((a, b) => a.date.localeCompare(b.date));
    await AsyncStorage.setItem(KEYS.weights, JSON.stringify(next));
  }

  async recordRestingHeartRate(sample: RestingHeartRateSample): Promise<void> {
    await AsyncStorage.setItem(KEYS.rhr(sample.date), JSON.stringify(sample));
  }

  async recordHrv(sample: HrvSample): Promise<void> {
    await AsyncStorage.setItem(KEYS.hrv(sample.date), JSON.stringify(sample));
  }

  /** Wipe everything this provider owns. Used by full account purge. */
  static async purge(): Promise<void> {
    const all = await AsyncStorage.getAllKeys();
    const ours = all.filter(k => k.startsWith(`${PREFIX}.`));
    if (ours.length) await AsyncStorage.multiRemove(ours);
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function readJson<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function* dateRange(start: Date, end: Date): Generator<string> {
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  const stop = new Date(end);
  stop.setHours(0, 0, 0, 0);
  while (d <= stop) {
    yield toDateKey(d);
    d.setDate(d.getDate() + 1);
  }
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
