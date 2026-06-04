// ── WHOOP PROVIDER (skeleton)
//
// Whoop poskytuje wellness data (sleep, recovery, strain, HRV, RHR) — to,
// co Strava nemá. Vyžaduje aktivní Whoop subscription.
//
// API: REST OAuth 2.0, base URL `https://api.prod.whoop.com/developer/v1/`.
// Klíčové endpointy:
//   GET /cycle             — denní cykly (recovery)
//   GET /activity/sleep    — spánkové záznamy
//   GET /activity/workout  — tréninky (HR strain)
//   GET /user/profile      — profil
//   GET /user/body_measurement — váha + hrudník
//
// HRV: poskytuje RMSSD (ne SDNN, jako Apple Health).
// Resting HR: jeden vzorek per cycle (přes noc).
//
// Stejně jako Strava: OAuth flow přes backend (client_secret), token přes
// OAuthTokenStore. Tato třída implementuje read-side, OAuth UI dorazí
// později.

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
import { isExpired, type OAuthTokenStore } from './oauth/OAuthTokenStore';

const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer/v1';

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

  // Whoop nemá denní kroky (není to step counter, ale strap). Vracíme prázdné.
  async getDailyActivityRange(): Promise<DailyActivitySummary[]> { return []; }

  async getLatestBodyWeight(): Promise<BodyWeightSample | null> {
    // TODO(whoop): GET /user/body_measurement
    return null;
  }

  async getBodyWeightRange(_start: Date, _end: Date): Promise<BodyWeightSample[]> {
    // Whoop nemá public body_measurement history endpoint, jen latest.
    return [];
  }

  async getSleepSummary(_start: Date, _end: Date): Promise<SleepSummary[]> {
    // TODO(whoop): GET /activity/sleep?start=...&end=...
    // mapovat na SleepSummary (total/deep/rem/awake minutes)
    return [];
  }

  async getWorkoutSummaries(_start: Date, _end: Date): Promise<WorkoutSummary[]> {
    // TODO(whoop): GET /activity/workout
    return [];
  }

  async getRestingHeartRate(_date: Date): Promise<RestingHeartRateSample | null> {
    // TODO(whoop): GET /cycle?start=date,end=date → resting_heart_rate
    return null;
  }

  async getHrv(_date: Date): Promise<HrvSample | null> {
    // TODO(whoop): GET /cycle?start=date,end=date → hrv_rmssd_milli
    // metric: 'rmssd' (Whoop dává RMSSD, ne SDNN)
    return null;
  }

  async getRecoveryInputs(_start: Date, _end: Date): Promise<RecoveryInputs[]> {
    // TODO(whoop): GET /cycle?start=...&end=... → map to RecoveryInputs[]
    return [];
  }
}

// Reference: tady bude později reálná implementace.
// Pro teď slouží jako compilable interface skeleton.
export const __WHOOP_API_BASE__ = WHOOP_API_BASE;
