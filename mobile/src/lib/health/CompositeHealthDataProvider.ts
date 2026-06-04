// ── COMPOSITE HEALTH DATA PROVIDER
//
// Wraps N providers a vrací sjednocená data. Uživatel může mít zároveň:
//   - Apple Health (steps, sleep)
//   - Strava (workouts s GPS + power)
//   - Whoop (HRV, recovery, RHR z noci)
//   - Manual (váha — pokud Whoop nemá body composition)
//
// Pravidla mergování:
//   1. Pro **single-value** dotazy (RHR / HRV / latest weight) vrátíme
//      první non-null odpověď v pořadí priority. Priority je dáno
//      pořadím v konstruktoru — uživatel si ji nastaví v Settings.
//   2. Pro **list** dotazy (activities / workouts / sleep) sloučíme
//      odpovědi a deduplikujeme přes (externalId | id). První occurrence
//      v priority pořadí vyhrává.
//   3. Permission status je nejhorší ze všech (denied > partial > granted
//      > not_determined > unavailable).
//
// Žádný request nesmí spadnout kvůli jedinému providerovi — chyby
// loggujeme a pokračujeme s ostatními. Health data je nice-to-have.

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
  WorkoutSummary,
} from '../../types/health';
import type { RecoveryInputs } from '../../types/coach';

export class CompositeHealthDataProvider implements HealthDataProvider {
  readonly name = 'composite' as const;

  /** Pořadí = priorita. providers[0] vyhrává single-value konflikty. */
  constructor(private readonly providers: HealthDataProvider[]) {}

  get sources(): HealthDataProvider[] {
    return this.providers.slice();
  }

  async isAvailable(): Promise<boolean> {
    const flags = await Promise.all(this.providers.map(p => safe(p.isAvailable())));
    return flags.some(Boolean);
  }

  async getPermissionStatus(): Promise<HealthPermissionStatus> {
    const statuses = await Promise.all(this.providers.map(p => safe(p.getPermissionStatus(), 'unavailable' as HealthPermissionStatus)));
    return mergePermissionStatus(statuses);
  }

  async requestPermissions(types: HealthDataType[]): Promise<HealthPermissionResult> {
    const results = await Promise.all(this.providers.map(p => safe(p.requestPermissions(types), { status: 'unavailable' as HealthPermissionStatus, granted: [] as HealthDataType[], denied: types })));
    const granted = uniq(results.flatMap(r => r.granted));
    const denied = uniq(types.filter(t => !granted.includes(t)));
    return {
      status: mergePermissionStatus(results.map(r => r.status)),
      granted,
      denied,
    };
  }

  async getDailyActivityRange(start: Date, end: Date): Promise<DailyActivitySummary[]> {
    const all = await Promise.all(this.providers.map(p => safe(p.getDailyActivityRange(start, end), [] as DailyActivitySummary[])));
    // Per-day priority pick: providers[0]'s entry for a date wins.
    const byDate = new Map<string, DailyActivitySummary>();
    for (const list of all) {
      for (const item of list) {
        if (!byDate.has(item.date)) byDate.set(item.date, item);
      }
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  async getWorkoutSummaries(start: Date, end: Date): Promise<WorkoutSummary[]> {
    const all = await Promise.all(this.providers.map(p => safe(p.getWorkoutSummaries(start, end), [] as WorkoutSummary[])));
    // Dedup by externalId (cross-source: Apple Watch run also synced to Strava)
    // and by start-time + kind within ±60 s window as a fallback.
    const seen = new Map<string, WorkoutSummary>();
    for (const list of all) {
      for (const w of list) {
        const key = w.externalId || `${w.kind}-${w.startedAt}`;
        if (seen.has(key)) continue;
        // Fuzzy match: same kind within 60 s
        const fuzzyDup = Array.from(seen.values()).some(existing =>
          existing.kind === w.kind &&
          Math.abs(new Date(existing.startedAt).getTime() - new Date(w.startedAt).getTime()) < 60_000,
        );
        if (fuzzyDup) continue;
        seen.set(key, w);
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  }

  async getLatestBodyWeight(maxDaysOld?: number): Promise<BodyWeightSample | null> {
    for (const p of this.providers) {
      const w = await safe(p.getLatestBodyWeight(maxDaysOld), null as BodyWeightSample | null);
      if (w) return w;
    }
    return null;
  }

  async getBodyWeightRange(start: Date, end: Date): Promise<BodyWeightSample[]> {
    const all = await Promise.all(this.providers.map(p => safe(p.getBodyWeightRange(start, end), [] as BodyWeightSample[])));
    // Per-date priority pick — first non-null entry per date wins.
    const byDate = new Map<string, BodyWeightSample>();
    for (const list of all) {
      for (const w of list) {
        if (!byDate.has(w.date)) byDate.set(w.date, w);
      }
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  async getSleepSummary(start: Date, end: Date): Promise<SleepSummary[]> {
    const all = await Promise.all(this.providers.map(p => safe(p.getSleepSummary(start, end), [] as SleepSummary[])));
    const byDate = new Map<string, SleepSummary>();
    for (const list of all) {
      for (const s of list) {
        if (!byDate.has(s.date)) byDate.set(s.date, s);
      }
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  async getRestingHeartRate(date: Date): Promise<RestingHeartRateSample | null> {
    for (const p of this.providers) {
      const v = await safe(p.getRestingHeartRate(date), null as RestingHeartRateSample | null);
      if (v) return v;
    }
    return null;
  }

  async getHrv(date: Date): Promise<HrvSample | null> {
    for (const p of this.providers) {
      const v = await safe(p.getHrv(date), null as HrvSample | null);
      if (v) return v;
    }
    return null;
  }

  async getRecoveryInputs(start: Date, end: Date): Promise<RecoveryInputs[]> {
    const all = await Promise.all(this.providers.map(p => safe(p.getRecoveryInputs(start, end), [] as RecoveryInputs[])));
    const byDate = new Map<string, RecoveryInputs>();
    for (const list of all) {
      for (const item of list) {
        if (!item.date) continue;
        const existing = byDate.get(item.date);
        if (!existing) {
          byDate.set(item.date, { ...item, baseline: { ...item.baseline } });
        } else {
          if (existing.todaySleepMinutes === null || existing.todaySleepMinutes === undefined) {
            existing.todaySleepMinutes = item.todaySleepMinutes;
          }
          if (existing.todayRhrBpm === null || existing.todayRhrBpm === undefined) {
            existing.todayRhrBpm = item.todayRhrBpm;
          }
          if (existing.todayHrvMs === null || existing.todayHrvMs === undefined) {
            existing.todayHrvMs = item.todayHrvMs;
          }
          if (existing.acwr === null || existing.acwr === undefined) {
            existing.acwr = item.acwr;
          }
          if (existing.sleepDebtHours === null || existing.sleepDebtHours === undefined) {
            existing.sleepDebtHours = item.sleepDebtHours;
          }
          if (existing.recoveryDebt === null || existing.recoveryDebt === undefined) {
            existing.recoveryDebt = item.recoveryDebt;
          }
          if (existing.subjectiveEnergy === null || existing.subjectiveEnergy === undefined) {
            existing.subjectiveEnergy = item.subjectiveEnergy;
          }
          if (existing.subjectiveSoreness === null || existing.subjectiveSoreness === undefined) {
            existing.subjectiveSoreness = item.subjectiveSoreness;
          }
          if (item.baseline) {
            existing.baseline = existing.baseline || {};
            if (existing.baseline.rhrMeanBpm === null || existing.baseline.rhrMeanBpm === undefined) {
              existing.baseline.rhrMeanBpm = item.baseline.rhrMeanBpm;
            }
            if (existing.baseline.hrvMeanMs === null || existing.baseline.hrvMeanMs === undefined) {
              existing.baseline.hrvMeanMs = item.baseline.hrvMeanMs;
            }
            if (existing.baseline.sleepMeanMinutes === null || existing.baseline.sleepMeanMinutes === undefined) {
              existing.baseline.sleepMeanMinutes = item.baseline.sleepMeanMinutes;
            }
          }
        }
      }
    }
    return Array.from(byDate.values()).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Run a promise; on rejection return fallback and swallow the error.
 *  Composite must never fail just because one source went down. */
async function safe<T>(p: Promise<T>): Promise<T | null>;
async function safe<T>(p: Promise<T>, fallback: T): Promise<T>;
async function safe<T>(p: Promise<T>, fallback?: T): Promise<T | null> {
  try {
    return await p;
  } catch {
    return fallback === undefined ? null : fallback;
  }
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

const PERMISSION_RANK: Record<HealthPermissionStatus, number> = {
  granted: 4,
  partial: 3,
  denied: 2,
  not_determined: 1,
  unavailable: 0,
};

/** Vrátí "nejlepší" status, který má alespoň jeden zdroj. Pokud má aspoň
 *  jeden 'granted' ale jiný 'denied', vrátíme 'partial' — odpovídá realitě
 *  (něco máme, něco ne). */
function mergePermissionStatus(statuses: HealthPermissionStatus[]): HealthPermissionStatus {
  if (statuses.length === 0) return 'unavailable';
  const ranks = statuses.map(s => PERMISSION_RANK[s]);
  const max = Math.max(...ranks);
  const min = Math.min(...ranks);
  if (max >= PERMISSION_RANK.granted && min <= PERMISSION_RANK.denied) return 'partial';
  const winner = statuses[ranks.indexOf(max)];
  return winner;
}
