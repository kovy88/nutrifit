// ── OURA PROVIDER
//
// Oura poskytuje spánek (duration + HRV + resting HR), denní aktivitu
// (kroky, kalorie) a tréninky. OAuth flow přes backend (client_secret),
// token přes OAuthTokenStore — stejně jako Strava/Whoop.
//
// API: REST, base URL `https://api.ouraring.com/v2/usercollection`.
// Klíčové endpointy:
//   GET /sleep           — per-perioda spánek: total/deep/rem/awake duration,
//                           average_hrv, lowest_heart_rate, average_heart_rate.
//                           JEDINÝ zdroj HRV a resting HR u Oury — daily_readiness
//                           dává jen 0-100 skóre kontributoru (normalizovaný
//                           sub-score), NE syrové bpm/ms hodnoty.
//   GET /daily_activity  — kroky, aktivní/celkové kalorie.
//   GET /workout         — tréninky (activity, start/end_datetime, distance, calories).
//   GET /personal_info   — statická profile váha (jedna hodnota, ne časová řada —
//                           proto getBodyWeightRange() vrací vždy []).
//
// Zdroj pravdy pro field names (bez přístupu k živému Oura účtu k ověření):
// oficiální OpenAPI spec, ověřeno křížově přes dva nezávislé zdroje —
// github.com/Pinta365/oura_api (auto-generated TS types z OpenAPI) a
// github.com/louispires/oura-v2-custom-component (živá Home Assistant
// integrace) — obě se na stejných field names shodují.

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
import { refreshOuraToken } from './oauth/OuraOAuth';
import { toDateKey } from '../../utils/nutrition';

const OURA_API_BASE = 'https://api.ouraring.com/v2/usercollection';

type OuraSleepRecord = {
  day: string;
  total_sleep_duration?: number | null;
  deep_sleep_duration?: number | null;
  rem_sleep_duration?: number | null;
  awake_time?: number | null;
  efficiency?: number | null;
  average_hrv?: number | null;
  lowest_heart_rate?: number | null;
  type?: string | null;
};

type OuraActivityRecord = {
  day: string;
  steps?: number;
  active_calories?: number;
  high_activity_time?: number;
  medium_activity_time?: number;
};

type OuraWorkoutRecord = {
  id: string;
  activity: string;
  calories?: number | null;
  distance?: number | null;
  start_datetime: string;
  end_datetime: string;
};

type OuraPersonalInfo = {
  weight?: number | null;
};

/** Oura's `activity` field is a free-text string, not a strict enum in the
 *  API spec — covers the common tags; anything unrecognized falls back to
 *  'other' rather than throwing. */
const OURA_ACTIVITY_TO_KIND: Record<string, WorkoutKind> = {
  running: 'run',
  jogging: 'run',
  walking: 'walk',
  hiking: 'walk',
  cycling: 'cycle',
  biking: 'cycle',
  swimming: 'swim',
  strength_training: 'strength',
  weightlifting: 'strength',
  yoga: 'yoga',
  pilates: 'yoga',
  hiit: 'hiit',
  circuit_training: 'functional',
  crossfit: 'functional',
  rowing: 'rowing',
};

function mapActivity(activity: string): WorkoutKind {
  return OURA_ACTIVITY_TO_KIND[activity.toLowerCase()] ?? 'other';
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export class OuraProvider implements HealthDataProvider {
  readonly name = 'oura' as const;

  constructor(private tokens: OAuthTokenStore) {}

  async isAvailable(): Promise<boolean> {
    return (await this.tokens.getToken('oura')) !== null;
  }

  async getPermissionStatus(): Promise<HealthPermissionStatus> {
    const t = await this.tokens.getToken('oura');
    if (!t) return 'not_determined';
    if (isExpired(t) && !t.refreshToken) return 'denied';
    return 'granted';
  }

  async requestPermissions(types: HealthDataType[]): Promise<HealthPermissionResult> {
    const t = await this.tokens.getToken('oura');
    const status = t ? 'granted' : 'not_determined';
    return { status, granted: status === 'granted' ? types : [], denied: status === 'granted' ? [] : types };
  }

  /** Returns auth headers, transparently refreshing an expired token first.
   *  Returns null if there's no usable token — callers treat that as "no data".
   *  A missing token is the normal "not connected" state and stays quiet; a
   *  *failed refresh* is warned about, because it looks identical to "no data"
   *  to the caller even though the user has to reconnect to fix it. */
  private async authHeaders(): Promise<Record<string, string> | null> {
    let token = await this.tokens.getToken('oura');
    if (!token) return null;
    if (isExpired(token) && token.refreshToken) {
      const refreshed = await refreshOuraToken(this.tokens);
      if (!refreshed) {
        console.warn('OuraProvider: token refresh failed — user needs to reconnect Oura');
        return null;
      }
      token = await this.tokens.getToken('oura');
      if (!token) return null;
    }
    return { Authorization: `Bearer ${token.accessToken}` };
  }

  /** Fetches every page of a date-ranged Oura list endpoint (`{ data, next_token }`). */
  private async fetchAll<T>(path: string, start: Date, end: Date): Promise<T[]> {
    const headers = await this.authHeaders();
    if (!headers) return [];
    const startDate = toDateKey(start);
    const endDate = toDateKey(end);
    const out: T[] = [];
    let nextToken: string | null = null;
    do {
      const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
      if (nextToken) params.set('next_token', nextToken);
      let res: Response;
      try {
        res = await fetch(`${OURA_API_BASE}${path}?${params.toString()}`, { headers });
      } catch (err) {
        console.warn(`OuraProvider: ${path} request failed`, err);
        return out;
      }
      if (!res.ok) {
        console.warn(`OuraProvider: ${path} returned HTTP ${res.status}`);
        return out;
      }
      const body = await res.json().catch(() => null) as { data?: T[]; next_token?: string | null } | null;
      if (!body?.data) {
        console.warn(`OuraProvider: ${path} returned an unreadable body`);
        return out;
      }
      out.push(...body.data);
      nextToken = body.next_token ?? null;
    } while (nextToken);
    return out;
  }

  async getDailyActivityRange(start: Date, end: Date): Promise<DailyActivitySummary[]> {
    const records = await this.fetchAll<OuraActivityRecord>('/daily_activity', start, end);
    return records.map(r => ({
      date: r.day,
      steps: r.steps ?? 0,
      activeEnergyKcal: r.active_calories ?? 0,
      exerciseMinutes: Math.round(((r.high_activity_time ?? 0) + (r.medium_activity_time ?? 0)) / 60),
      source: 'oura' as const,
    }));
  }

  async getWorkoutSummaries(start: Date, end: Date): Promise<WorkoutSummary[]> {
    const records = await this.fetchAll<OuraWorkoutRecord>('/workout', start, end);
    return records.map(r => ({
      id: `oura-${r.id}`,
      externalId: r.id,
      startedAt: r.start_datetime,
      endedAt: r.end_datetime,
      kind: mapActivity(r.activity),
      durationMinutes: Math.round((new Date(r.end_datetime).getTime() - new Date(r.start_datetime).getTime()) / 60_000),
      distanceKm: r.distance != null ? Math.round((r.distance / 1000) * 100) / 100 : undefined,
      activeEnergyKcal: r.calories != null ? Math.round(r.calories) : undefined,
      source: 'oura' as const,
    }));
  }

  /** Oura can return more than one sleep period per day (naps + main sleep).
   *  Prefer the one tagged `long_sleep`; fall back to the longest entry. */
  private pickMainSleepPerDay(records: OuraSleepRecord[]): Map<string, OuraSleepRecord> {
    const byDay = new Map<string, OuraSleepRecord[]>();
    for (const r of records) {
      if (!r.total_sleep_duration) continue;
      const list = byDay.get(r.day) ?? [];
      list.push(r);
      byDay.set(r.day, list);
    }
    const out = new Map<string, OuraSleepRecord>();
    for (const [day, list] of byDay) {
      const longSleep = list.find(r => r.type === 'long_sleep');
      const best = longSleep ?? list.reduce((a, b) => ((b.total_sleep_duration ?? 0) > (a.total_sleep_duration ?? 0) ? b : a));
      out.set(day, best);
    }
    return out;
  }

  private async fetchMainSleepPerDay(start: Date, end: Date): Promise<Map<string, OuraSleepRecord>> {
    return this.pickMainSleepPerDay(await this.fetchAll<OuraSleepRecord>('/sleep', start, end));
  }

  async getSleepSummary(start: Date, end: Date): Promise<SleepSummary[]> {
    const byDay = await this.fetchMainSleepPerDay(start, end);
    return Array.from(byDay.values()).map(r => ({
      date: r.day,
      totalMinutes: Math.round((r.total_sleep_duration ?? 0) / 60),
      deepMinutes: r.deep_sleep_duration != null ? Math.round(r.deep_sleep_duration / 60) : undefined,
      remMinutes: r.rem_sleep_duration != null ? Math.round(r.rem_sleep_duration / 60) : undefined,
      awakeMinutes: r.awake_time != null ? Math.round(r.awake_time / 60) : undefined,
      efficiency: r.efficiency != null ? r.efficiency / 100 : undefined,
      source: 'oura' as const,
    }));
  }

  async getRestingHeartRate(date: Date): Promise<RestingHeartRateSample | null> {
    const byDay = await this.fetchMainSleepPerDay(date, addDays(date, 1));
    const record = byDay.get(toDateKey(date));
    if (!record?.lowest_heart_rate) return null;
    return { date: record.day, bpm: Math.round(record.lowest_heart_rate), source: 'oura' };
  }

  async getHrv(date: Date): Promise<HrvSample | null> {
    const byDay = await this.fetchMainSleepPerDay(date, addDays(date, 1));
    const record = byDay.get(toDateKey(date));
    if (!record?.average_hrv) return null;
    // Oura reports RMSSD, not SDNN (Apple Health's metric).
    return { date: record.day, ms: Math.round(record.average_hrv), metric: 'rmssd', source: 'oura' };
  }

  async getRecoveryInputs(start: Date, end: Date): Promise<RecoveryInputs[]> {
    const byDay = await this.fetchMainSleepPerDay(start, end);
    return Array.from(byDay.values()).map(r => ({
      date: r.day,
      todaySleepMinutes: r.total_sleep_duration != null ? Math.round(r.total_sleep_duration / 60) : null,
      todayRhrBpm: r.lowest_heart_rate != null ? Math.round(r.lowest_heart_rate) : null,
      todayHrvMs: r.average_hrv != null ? Math.round(r.average_hrv) : null,
    }));
  }

  async getLatestBodyWeight(): Promise<BodyWeightSample | null> {
    const headers = await this.authHeaders();
    if (!headers) return null;
    let res: Response;
    try {
      res = await fetch(`${OURA_API_BASE}/personal_info`, { headers });
    } catch (err) {
      console.warn('OuraProvider: /personal_info request failed', err);
      return null;
    }
    if (!res.ok) {
      console.warn(`OuraProvider: /personal_info returned HTTP ${res.status}`);
      return null;
    }
    const info = await res.json().catch(() => null) as OuraPersonalInfo | null;
    // No weight on the Oura profile is a legitimate empty result, not a failure.
    if (!info?.weight) return null;
    return { date: toDateKey(new Date()), weightKg: info.weight, source: 'oura' };
  }

  /** Oura's personal_info.weight is a single static profile value, not a
   *  tracked history — there's no range endpoint to page through. */
  async getBodyWeightRange(): Promise<BodyWeightSample[]> {
    return [];
  }
}
