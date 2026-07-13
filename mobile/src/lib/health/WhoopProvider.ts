// ── WHOOP PROVIDER
//
// Whoop poskytuje wellness data (sleep, recovery, HRV, RHR, workouts) — to,
// co Strava nemá. Vyžaduje aktivní Whoop subscription. OAuth flow přes
// backend (client_secret), token přes OAuthTokenStore — stejně jako
// Strava/Oura.
//
// API: REST OAuth 2.0, base URL `https://api.prod.whoop.com/developer`.
// v2 endpointy (v1 je deprecated — viz developer.whoop.com v1-v2 migration
// guide):
//   GET /v2/activity/sleep    — spánek: stage_summary (v milisekundách),
//                                sleep_efficiency_percentage.
//   GET /v2/activity/workout  — tréninky: sport_id (numeric enum), strain,
//                                kilojoule, distance_meter, heart rate.
//   GET /v2/recovery          — JEDINÝ zdroj HRV (hrv_rmssd_milli) a resting
//                                HR (resting_heart_rate). NE /v2/cycle —
//                                cycle dává jen strain/kilojoule/avg+max HR,
//                                žádné HRV/RHR (na rozdíl od toho, co
//                                naznačoval starý TODO komentář v tomhle
//                                souboru).
//   GET /v2/user/measurement/body — { height_meter, weight_kilogram,
//                                      max_heart_rate }, jedna statická
//                                      hodnota, žádná historie (jako Oura's
//                                      personal_info).
//
// HRV: RMSSD (ne SDNN, jako Apple Health).
// Pagination: `{ records, next_token }`, continuation přes `nextToken`
// (camelCase) query param — ověřeno proti github.com/hedgertronic/whoop
// (živá, udržovaná Python knihovna s doslovnými example JSON response body
// v docstringech), ne proti prose dokumentaci — ta se ukázala mít zastaralé
// v1 field names (`heart_rate_variability`/`sleep_performance`) na jedné z
// tutorial stránek, zatímco jiná stránka dávala v2 fields — stejná past
// jako u Oury, kde dokumentace nebyla spolehlivá.
//
// sport_id → WorkoutKind mapping je community-sourced (WHOOP nezveřejňuje
// oficiální enum tabulku), cross-checked proti reálným workout datům v
// github.com/patrickloeber/whoop-analyzer.

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
import { isExpired, type OAuthTokenStore } from './oauth/OAuthTokenStore';
import { refreshWhoopToken } from './oauth/WhoopOAuth';
import { toDateKey } from '../../utils/nutrition';

const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer';

type WhoopSleepRecord = {
  id: string;
  start: string;
  end: string;
  nap: boolean;
  score_state: string;
  score?: {
    stage_summary?: {
      total_awake_time_milli?: number;
      total_light_sleep_time_milli?: number;
      total_slow_wave_sleep_time_milli?: number;
      total_rem_sleep_time_milli?: number;
    };
    sleep_efficiency_percentage?: number;
  };
};

type WhoopRecoveryRecord = {
  cycle_id: number;
  sleep_id: string;
  created_at: string;
  score_state: string;
  score?: {
    recovery_score?: number;
    resting_heart_rate?: number;
    hrv_rmssd_milli?: number;
  };
};

type WhoopWorkoutRecord = {
  id: string;
  start: string;
  end: string;
  sport_id: number;
  score_state: string;
  score?: {
    average_heart_rate?: number;
    max_heart_rate?: number;
    kilojoule?: number;
    distance_meter?: number;
  };
};

type WhoopBodyMeasurement = {
  weight_kilogram?: number;
};

/** WHOOP doesn't publish an official sport_id enum — mapping cross-checked
 *  against real observed workout data (see header comment). Anything
 *  unmapped falls back to 'other' rather than throwing. */
const WHOOP_SPORT_ID_TO_KIND: Record<number, WorkoutKind> = {
  0: 'run',
  63: 'walk', 52: 'walk',                          // Walking, Hiking/Rucking
  1: 'cycle', 57: 'cycle', 97: 'cycle',             // Cycling, Mountain Biking, Spin
  33: 'swim',
  45: 'strength', 59: 'strength', 123: 'strength',  // Weightlifting, Powerlifting, Strength Trainer
  96: 'hiit',
  44: 'yoga', 43: 'yoga', 128: 'yoga',              // Yoga, Pilates, Stretching
  48: 'functional', 103: 'functional', 84: 'functional', // Functional Fitness, Box Fitness, Jumping Rope
  18: 'rowing',
};

function mapSportId(sportId: number): WorkoutKind {
  return WHOOP_SPORT_ID_TO_KIND[sportId] ?? 'other';
}

function durationMinutes(start: string, end: string): number {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000);
}

export class WhoopProvider implements HealthDataProvider {
  readonly name = 'whoop' as const;

  constructor(private tokens: OAuthTokenStore) {}

  async isAvailable(): Promise<boolean> {
    return (await this.tokens.getToken('whoop')) !== null;
  }

  async getPermissionStatus(): Promise<HealthPermissionStatus> {
    const t = await this.tokens.getToken('whoop');
    if (!t) return 'not_determined';
    if (isExpired(t) && !t.refreshToken) return 'denied';
    return 'granted';
  }

  async requestPermissions(types: HealthDataType[]): Promise<HealthPermissionResult> {
    const t = await this.tokens.getToken('whoop');
    const status = t ? 'granted' : 'not_determined';
    return { status, granted: status === 'granted' ? types : [], denied: status === 'granted' ? [] : types };
  }

  /** Returns auth headers, transparently refreshing an expired token first.
   *  Returns null if there's no usable token — callers treat that as "no data". */
  private async authHeaders(): Promise<Record<string, string> | null> {
    let token = await this.tokens.getToken('whoop');
    if (!token) return null;
    if (isExpired(token) && token.refreshToken) {
      const refreshed = await refreshWhoopToken(this.tokens);
      if (!refreshed) return null;
      token = await this.tokens.getToken('whoop');
      if (!token) return null;
    }
    return { Authorization: `Bearer ${token.accessToken}` };
  }

  /** Fetches every page of a date-ranged Whoop collection endpoint
   *  (`{ records, next_token }`), continuing via the `nextToken` param. */
  private async fetchAll<T>(path: string, start: Date, end: Date): Promise<T[]> {
    const headers = await this.authHeaders();
    if (!headers) return [];
    const out: T[] = [];
    const params = new URLSearchParams({ start: start.toISOString(), end: end.toISOString(), limit: '25' });
    for (;;) {
      let res: Response;
      try {
        res = await fetch(`${WHOOP_API_BASE}${path}?${params.toString()}`, { headers });
      } catch {
        return out;
      }
      if (!res.ok) return out;
      const body = await res.json().catch(() => null) as { records?: T[]; next_token?: string | null } | null;
      if (!body?.records) return out;
      out.push(...body.records);
      if (!body.next_token) return out;
      params.set('nextToken', body.next_token);
    }
  }

  // Whoop nemá denní kroky (není to step counter, ale strap). Vracíme prázdné.
  async getDailyActivityRange(): Promise<DailyActivitySummary[]> { return []; }

  async getLatestBodyWeight(): Promise<BodyWeightSample | null> {
    const headers = await this.authHeaders();
    if (!headers) return null;
    let res: Response;
    try {
      res = await fetch(`${WHOOP_API_BASE}/v2/user/measurement/body`, { headers });
    } catch {
      return null;
    }
    if (!res.ok) return null;
    const info = await res.json().catch(() => null) as WhoopBodyMeasurement | null;
    if (!info?.weight_kilogram) return null;
    return { date: toDateKey(new Date()), weightKg: info.weight_kilogram, source: 'whoop' };
  }

  /** Whoop's body measurement is a single static profile value, not a
   *  tracked history — there's no range endpoint to page through. */
  async getBodyWeightRange(): Promise<BodyWeightSample[]> {
    return [];
  }

  async getSleepSummary(start: Date, end: Date): Promise<SleepSummary[]> {
    const records = await this.fetchAll<WhoopSleepRecord>('/v2/activity/sleep', start, end);
    const out: SleepSummary[] = [];
    for (const r of records) {
      if (r.score_state !== 'SCORED' || !r.score?.stage_summary) continue;
      const s = r.score.stage_summary;
      const light = (s.total_light_sleep_time_milli ?? 0) / 60_000;
      const deep = (s.total_slow_wave_sleep_time_milli ?? 0) / 60_000;
      const rem = (s.total_rem_sleep_time_milli ?? 0) / 60_000;
      out.push({
        date: toDateKey(r.end),
        totalMinutes: Math.round(light + deep + rem),
        deepMinutes: Math.round(deep),
        remMinutes: Math.round(rem),
        awakeMinutes: s.total_awake_time_milli != null ? Math.round(s.total_awake_time_milli / 60_000) : undefined,
        efficiency: r.score.sleep_efficiency_percentage != null ? r.score.sleep_efficiency_percentage / 100 : undefined,
        source: 'whoop' as const,
      });
    }
    return out;
  }

  async getWorkoutSummaries(start: Date, end: Date): Promise<WorkoutSummary[]> {
    const records = await this.fetchAll<WhoopWorkoutRecord>('/v2/activity/workout', start, end);
    return records.map(r => ({
      id: `whoop-${r.id}`,
      externalId: r.id,
      startedAt: r.start,
      endedAt: r.end,
      kind: mapSportId(r.sport_id),
      durationMinutes: durationMinutes(r.start, r.end),
      distanceKm: r.score?.distance_meter != null ? Math.round((r.score.distance_meter / 1000) * 100) / 100 : undefined,
      avgHeartRate: r.score?.average_heart_rate,
      maxHeartRate: r.score?.max_heart_rate,
      activeEnergyKcal: r.score?.kilojoule != null ? Math.round(r.score.kilojoule / 4.184) : undefined,
      source: 'whoop' as const,
    }));
  }

  private async fetchRecoveryByDate(start: Date, end: Date): Promise<Map<string, WhoopRecoveryRecord>> {
    const records = await this.fetchAll<WhoopRecoveryRecord>('/v2/recovery', start, end);
    const byDate = new Map<string, WhoopRecoveryRecord>();
    for (const r of records) {
      if (r.score_state !== 'SCORED' || !r.score) continue;
      byDate.set(toDateKey(r.created_at), r);
    }
    return byDate;
  }

  async getRestingHeartRate(date: Date): Promise<RestingHeartRateSample | null> {
    const dayEnd = new Date(date);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const byDate = await this.fetchRecoveryByDate(date, dayEnd);
    const record = byDate.get(toDateKey(date));
    if (!record?.score?.resting_heart_rate) return null;
    return { date: toDateKey(date), bpm: Math.round(record.score.resting_heart_rate), source: 'whoop' };
  }

  async getHrv(date: Date): Promise<HrvSample | null> {
    const dayEnd = new Date(date);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const byDate = await this.fetchRecoveryByDate(date, dayEnd);
    const record = byDate.get(toDateKey(date));
    if (!record?.score?.hrv_rmssd_milli) return null;
    // Whoop reports RMSSD, not SDNN (Apple Health's metric).
    return { date: toDateKey(date), ms: Math.round(record.score.hrv_rmssd_milli), metric: 'rmssd', source: 'whoop' };
  }

  async getRecoveryInputs(start: Date, end: Date): Promise<RecoveryInputs[]> {
    const [sleepRecords, recoveryByDate] = await Promise.all([
      this.getSleepSummary(start, end),
      this.fetchRecoveryByDate(start, end),
    ]);
    const sleepByDate = new Map(sleepRecords.map(s => [s.date, s]));
    const dates = new Set([...sleepByDate.keys(), ...recoveryByDate.keys()]);
    return Array.from(dates).map(date => {
      const recovery = recoveryByDate.get(date)?.score;
      return {
        date,
        todaySleepMinutes: sleepByDate.get(date)?.totalMinutes ?? null,
        todayRhrBpm: recovery?.resting_heart_rate != null ? Math.round(recovery.resting_heart_rate) : null,
        todayHrvMs: recovery?.hrv_rmssd_milli != null ? Math.round(recovery.hrv_rmssd_milli) : null,
      };
    });
  }
}
