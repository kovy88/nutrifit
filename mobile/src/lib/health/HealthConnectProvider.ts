// ── HEALTH CONNECT PROVIDER (Android placeholder)
//
// Google Health Connect je novější unified Android API (Android 14+,
// preinstalled na novějších telefonech, na starších se instaluje z Play
// Store). Agreguje data ze Samsung Health, Fitbitu, Garmin Connect,
// Zepp App (pokud uživatel zapne sync), Withings, Polar Flow, atd.
//
// Volné implementace v ekosystému (květen 2026):
//   - `react-native-health-connect` (matinzm) — community, RN 0.72+
//
// Skutečná integrace vyžaduje:
//   1. `npx expo install react-native-health-connect`
//   2. Config plugin pro Android manifest (HEALTH_CONNECT_PERMISSIONS, ...)
//   3. EAS Build (Expo Go nestačí — native plugin)
//   4. Pro release na Play Store nutné odeslat Google Play "Health Data
//      Disclosure Form" s zdůvodněním, k čemu data potřebujeme.
//
// Tento soubor je interface-compliant stub. Provider vrací 'unavailable'
// dokud nedoinstalujeme native plugin a nevyplníme TODO(android) body.

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
  WorkoutSummary,
} from '../../types/health';

export class HealthConnectProvider implements HealthDataProvider {
  readonly name = 'health_connect' as const;

  /** Static gate: jen Android, aniž bychom načítali native modul. */
  static isSupported(): boolean {
    return Platform.OS === 'android';
  }

  async isAvailable(): Promise<boolean> {
    // TODO(android): po instalaci `react-native-health-connect` ověřit
    // initialize() + getSdkStatus() — Health Connect může chybět na
    // starších zařízeních (Android < 14 bez nainstalované apky).
    return false;
  }

  async getPermissionStatus(): Promise<HealthPermissionStatus> {
    return 'unavailable';
  }

  async requestPermissions(types: HealthDataType[]): Promise<HealthPermissionResult> {
    // TODO(android): requestPermission([{accessType:'read',recordType:'Steps'},…])
    return { status: 'unavailable', granted: [], denied: types };
  }

  async getDailyActivityRange(_start: Date, _end: Date): Promise<DailyActivitySummary[]> {
    // TODO(android): readRecords('Steps', { timeRangeFilter }) +
    //                readRecords('ActiveCaloriesBurned', …) +
    //                readRecords('TotalCaloriesBurned', …) +
    //                readRecords('Distance', …) → agregovat per den
    return [];
  }

  async getWorkoutSummaries(_start: Date, _end: Date): Promise<WorkoutSummary[]> {
    // TODO(android): readRecords('ExerciseSession', …) → mapovat
    // ExerciseType konstanty na WorkoutKind.
    return [];
  }

  async getLatestBodyWeight(_maxDaysOld?: number): Promise<BodyWeightSample | null> {
    // TODO(android): readRecords('Weight', { timeRangeFilter, ascendingOrder:false, pageSize:1 })
    return null;
  }

  async getBodyWeightRange(_start: Date, _end: Date): Promise<BodyWeightSample[]> {
    // TODO(android): readRecords('Weight', { timeRangeFilter })
    return [];
  }

  async getSleepSummary(_start: Date, _end: Date): Promise<SleepSummary[]> {
    // TODO(android): readRecords('SleepSession', …)
    return [];
  }

  async getRestingHeartRate(_date: Date): Promise<RestingHeartRateSample | null> {
    // TODO(android): readRecords('RestingHeartRate', …)
    return null;
  }

  async getHrv(_date: Date): Promise<HrvSample | null> {
    // TODO(android): readRecords('HeartRateVariabilityRmssd', …)
    // Pozor: Health Connect dává RMSSD, ne SDNN — mapovat metric: 'rmssd'.
    return null;
  }
}
