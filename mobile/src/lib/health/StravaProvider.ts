// ── STRAVA PROVIDER
//
// Strava poskytuje workouty (běh / kolo / plavání / …) přes REST API.
// **Nedostává** sleep, RHR, HRV ani daily steps — Strava není wellness
// platforma, je to tréninkový deník. Pro spánek a regeneraci je nutné
// kombinovat s jiným zdrojem (Whoop / Oura / Apple Health / Health Connect).
//
// Pro tuto třídu je relevantní jen getWorkoutSummaries(). Ostatní metody
// vrací prázdná data — composite provider je pak doplní z jiného zdroje.
//
// OAuth flow (implemented — viz useStravaConnect hook + lib/health/oauth/StravaOAuth.ts):
//   1. App opens `https://www.strava.com/oauth/authorize?client_id=<id>
//        &response_type=code&redirect_uri=nutrifit://strava/callback
//        &scope=activity:read_all,profile:read_all`
//   2. User authorizes, Strava redirectne s ?code=...
//   3. Mobile zachytí deep link a pošle `code` na **backend**
//      (`POST /api/strava/exchange`), protože client_secret tam nesmí být.
//   4. Backend vymění code → token a vrátí access_token + refresh_token.
//   5. Mobile uloží token přes OAuthTokenStore.setToken('strava', …)
//
// Tahle třída (HealthDataProvider) sama connect() nespouští — to dělá
// useStravaConnect() přes StravaOAuth.beginConnect(), protože otevření
// browseru + deep link callback nesedí do requestPermissions()'s
// synchronního tvaru. Tahle třída jen čte token, který tam uložil.

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
import { isExpired, type OAuthToken, type OAuthTokenStore } from './oauth/OAuthTokenStore';
import { refreshStravaToken } from './oauth/StravaOAuth';

const STRAVA_API_BASE = 'https://www.strava.com/api/v3';

/** Mapování Strava activity.type → naše WorkoutKind. */
const STRAVA_TYPE_TO_KIND: Record<string, WorkoutKind> = {
  Run: 'run',
  TrailRun: 'run',
  VirtualRun: 'run',
  Walk: 'walk',
  Hike: 'walk',
  Ride: 'cycle',
  VirtualRide: 'cycle',
  GravelRide: 'cycle',
  MountainBikeRide: 'cycle',
  Swim: 'swim',
  WeightTraining: 'strength',
  Crossfit: 'functional',
  HighIntensityIntervalTraining: 'hiit',
  Yoga: 'yoga',
  Rowing: 'rowing',
};

function mapType(stravaType: string): WorkoutKind {
  return STRAVA_TYPE_TO_KIND[stravaType] ?? 'other';
}

export class StravaProvider implements HealthDataProvider {
  readonly name = 'strava' as const;

  constructor(private tokens: OAuthTokenStore) {}

  async isAvailable(): Promise<boolean> {
    const token = await this.tokens.getToken('strava');
    return token !== null;
  }

  async getPermissionStatus(): Promise<HealthPermissionStatus> {
    const token = await this.tokens.getToken('strava');
    if (!token) return 'not_determined';
    if (isExpired(token) && !token.refreshToken) return 'denied';
    return 'granted';
  }

  async requestPermissions(types: HealthDataType[]): Promise<HealthPermissionResult> {
    // Nespouští connect() flow — to dělá useStravaConnect() (browser + deep
    // link callback), viz komentář nahoře souboru. Tahle metoda jen reportuje
    // stav podle toho, jestli token už je uložený.
    const token = await this.tokens.getToken('strava');
    const status = token ? 'granted' : 'not_determined';
    return {
      status,
      granted: status === 'granted' ? types.filter(t => t === 'workout') : [],
      denied: status === 'granted' ? types.filter(t => t !== 'workout') : types,
    };
  }

  // Strava NEPOSKYTUJE — vrátíme prázdná data, ať composite provider doplní z jinud.
  // Parametry musí být přítomné, aby concrete-class call site v testech / kódu prošel TS.
  async getDailyActivityRange(_start: Date, _end: Date): Promise<DailyActivitySummary[]> { return []; }
  async getLatestBodyWeight(_maxDaysOld?: number): Promise<BodyWeightSample | null> { return null; }
  async getBodyWeightRange(_start: Date, _end: Date): Promise<BodyWeightSample[]> { return []; }
  async getSleepSummary(_start: Date, _end: Date): Promise<SleepSummary[]> { return []; }
  async getRestingHeartRate(_date: Date): Promise<RestingHeartRateSample | null> { return null; }
  async getHrv(_date: Date): Promise<HrvSample | null> { return null; }
  async getRecoveryInputs(_start: Date, _end: Date): Promise<RecoveryInputs[]> { return []; }

  async getWorkoutSummaries(start: Date, end: Date): Promise<WorkoutSummary[]> {
    let token = await this.tokens.getToken('strava');
    if (!token) return [];

    // Chybějící token je normální "nepřipojeno" stav a mlčí; selhaný refresh
    // ale vypadá pro volajícího stejně jako "žádná data", přestože ho uživatel
    // musí spravit reconnectem — proto se loguje.
    if (isExpired(token) && token.refreshToken) {
      const refreshed = await refreshStravaToken(this.tokens);
      if (!refreshed) {
        console.warn('StravaProvider: token refresh failed — user needs to reconnect Strava');
        return [];
      }
      token = await this.tokens.getToken('strava');
      if (!token) return [];
    }

    const params = new URLSearchParams({
      after: String(Math.floor(start.getTime() / 1000)),
      before: String(Math.floor(end.getTime() / 1000) + 86_399),
      per_page: '100',
    });
    let res: Response;
    try {
      res = await fetch(`${STRAVA_API_BASE}/athlete/activities?${params}`, {
        headers: { Authorization: `Bearer ${token.accessToken}` },
      });
    } catch (err) {
      console.warn('StravaProvider: /athlete/activities request failed', err);
      return [];
    }
    if (!res.ok) {
      console.warn(`StravaProvider: /athlete/activities returned HTTP ${res.status}`);
      return [];
    }
    const raw = (await res.json()) as StravaActivity[];
    return raw.map(a => mapActivity(a));
  }
}

// ── Strava response shape (jen pole, která čteme) ────────────────────────────

type StravaActivity = {
  id: number;
  name: string;
  type: string;
  start_date: string;     // ISO 8601 UTC
  start_date_local: string;
  elapsed_time: number;   // seconds
  moving_time: number;
  distance: number;       // meters
  average_heartrate?: number;
  max_heartrate?: number;
  calories?: number;
};

function mapActivity(a: StravaActivity): WorkoutSummary {
  const startMs = new Date(a.start_date).getTime();
  const endIso = new Date(startMs + a.elapsed_time * 1000).toISOString();
  const durationMinutes = Math.round(a.moving_time / 60);
  const distanceKm = a.distance > 0 ? Math.round((a.distance / 1000) * 100) / 100 : undefined;
  const avgPaceSecPerKm = distanceKm && a.moving_time > 0
    ? Math.round(a.moving_time / distanceKm)
    : undefined;
  return {
    id: `strava-${a.id}`,
    externalId: String(a.id),
    startedAt: a.start_date,
    endedAt: endIso,
    kind: mapType(a.type),
    durationMinutes,
    distanceKm,
    avgPaceSecPerKm,
    avgHeartRate: a.average_heartrate ? Math.round(a.average_heartrate) : undefined,
    maxHeartRate: a.max_heartrate ? Math.round(a.max_heartrate) : undefined,
    activeEnergyKcal: a.calories ? Math.round(a.calories) : undefined,
    source: 'strava',
  };
}

/** Exported pro testy. */
export const __test__ = { mapActivity, mapType };
