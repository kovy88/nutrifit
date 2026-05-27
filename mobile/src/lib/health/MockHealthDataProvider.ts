// ── MOCK HEALTH DATA PROVIDER
//
// Deterministický mock — stejný seed = stejná data. Použití:
//   - Vývoj v Expo Go bez HealthKitu
//   - iOS Simulator (HealthKit dává nuly)
//   - Snapshot/E2E testy
//
// Hodnoty jsou v rozumných rozsazích pro normálního uživatele (8k–12k kroků,
// 1–3 tréninky týdně, 6–8 h spánku, RHR 55–70, HRV 30–60 ms SDNN).

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
import type { HealthDataProvider } from './HealthDataProvider';

export type MockHealthDataProviderOptions = {
  /** Seed pro PRNG — stejný seed garantuje stejná data napříč běhy. */
  seed?: number;
  /** Výchozí váha uživatele, k níž se generují odchylky ±0.5 kg. */
  weightKg?: number;
  /** Permission status, který mock předstírá. Default 'granted'. */
  permissionStatus?: HealthPermissionStatus;
};

export class MockHealthDataProvider implements HealthDataProvider {
  readonly name = 'mock' as const;

  private seed: number;
  private weightKg: number;
  private permissionStatus: HealthPermissionStatus;

  constructor(opts: MockHealthDataProviderOptions = {}) {
    this.seed = opts.seed ?? 42;
    this.weightKg = opts.weightKg ?? 75;
    this.permissionStatus = opts.permissionStatus ?? 'granted';
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async getPermissionStatus(): Promise<HealthPermissionStatus> {
    return this.permissionStatus;
  }

  async requestPermissions(types: HealthDataType[]): Promise<HealthPermissionResult> {
    return {
      status: this.permissionStatus,
      granted: this.permissionStatus === 'granted' ? types : [],
      denied: this.permissionStatus === 'denied' ? types : [],
    };
  }

  async getDailyActivityRange(start: Date, end: Date): Promise<DailyActivitySummary[]> {
    const out: DailyActivitySummary[] = [];
    for (const date of dateRange(start, end)) {
      const r = rng(this.seed, hash(date));
      // 7k–13k steps; weekday avg lower than weekend
      const dayOfWeek = new Date(date).getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const baseSteps = isWeekend ? 9000 : 8000;
      const steps = Math.round(baseSteps + (r() - 0.5) * 5000);
      const activeEnergyKcal = Math.round(steps * 0.04 + r() * 80);
      const basalEnergyKcal = Math.round(this.weightKg * 22);
      const distanceKm = Math.round((steps * 0.00075) * 10) / 10; // ~75 cm krok
      out.push({
        date,
        steps,
        activeEnergyKcal,
        basalEnergyKcal,
        distanceKm,
        exerciseMinutes: Math.round(r() * 45 + 10),
        standHours: Math.round(r() * 5 + 7),
        source: 'mock',
      });
    }
    return out;
  }

  async getWorkoutSummaries(start: Date, end: Date): Promise<WorkoutSummary[]> {
    const out: WorkoutSummary[] = [];
    // ~3 workouts/week deterministically distributed
    for (const date of dateRange(start, end)) {
      const r = rng(this.seed + 1, hash(date));
      if (r() > 0.42) continue; // ~3 dní z 7
      const kinds: WorkoutKind[] = ['run', 'strength', 'cycle', 'walk', 'functional'];
      const kind = kinds[Math.floor(r() * kinds.length)];
      const durationMinutes = Math.round(30 + r() * 40);
      const isCardio = kind === 'run' || kind === 'cycle' || kind === 'walk';
      const distanceKm = isCardio ? Math.round((durationMinutes * (kind === 'cycle' ? 0.35 : 0.16)) * 10) / 10 : undefined;
      out.push({
        id: `mock-${date}-${kind}`,
        startedAt: `${date}T17:30:00.000`,
        endedAt: `${date}T${pad(17 + Math.floor(durationMinutes / 60))}:${pad(30 + (durationMinutes % 60))}:00.000`,
        kind,
        durationMinutes,
        distanceKm,
        avgHeartRate: Math.round(125 + r() * 30),
        maxHeartRate: Math.round(155 + r() * 25),
        activeEnergyKcal: Math.round(durationMinutes * (isCardio ? 9 : 6)),
        source: 'mock',
      });
    }
    return out;
  }

  async getLatestBodyWeight(maxDaysOld = 30): Promise<BodyWeightSample | null> {
    const today = new Date();
    // mock has weight only every ~3 days; find latest within maxDaysOld
    for (let i = 0; i <= maxDaysOld; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const r = rng(this.seed + 2, hash(toDateKey(d)));
      if (i === 0 || r() < 0.3) {
        const drift = (r() - 0.5) * 1.0; // ±0.5 kg
        return {
          date: toDateKey(d),
          weightKg: Math.round((this.weightKg + drift) * 10) / 10,
          source: 'mock',
        };
      }
    }
    return null;
  }

  async getSleepSummary(start: Date, end: Date): Promise<SleepSummary[]> {
    const out: SleepSummary[] = [];
    for (const date of dateRange(start, end)) {
      const r = rng(this.seed + 3, hash(date));
      const totalMinutes = Math.round(360 + r() * 180); // 6–9 h
      const deepMinutes = Math.round(totalMinutes * (0.13 + r() * 0.06));
      const remMinutes = Math.round(totalMinutes * (0.18 + r() * 0.07));
      const awakeMinutes = Math.round(r() * 25);
      out.push({
        date,
        totalMinutes,
        deepMinutes,
        remMinutes,
        awakeMinutes,
        efficiency: Math.round((1 - awakeMinutes / totalMinutes) * 100) / 100,
        source: 'mock',
      });
    }
    return out;
  }

  async getRestingHeartRate(date: Date): Promise<RestingHeartRateSample | null> {
    const key = toDateKey(date);
    const r = rng(this.seed + 4, hash(key));
    return { date: key, bpm: Math.round(55 + r() * 15), source: 'mock' };
  }

  async getHrv(date: Date): Promise<HrvSample | null> {
    const key = toDateKey(date);
    const r = rng(this.seed + 5, hash(key));
    return { date: key, ms: Math.round(30 + r() * 30), metric: 'sdnn', source: 'mock' };
  }
}

// ── Deterministic helpers (no external deps) ─────────────────────────────────

/** FNV-1a 32-bit hash — converts a string seed component to a 32-bit int. */
function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 PRNG — small, fast, deterministic. Combines base seed + per-day hash. */
function rng(seed: number, salt: number): () => number {
  let a = (seed ^ salt) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
