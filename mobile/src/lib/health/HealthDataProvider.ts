// ── HEALTH DATA PROVIDER INTERFACE
//
// Abstrakce nad zdrojem zdravotních dat. Existují tři implementace:
//   - MockHealthDataProvider   — deterministická pro vývoj a iOS simulator
//   - ManualHealthDataProvider — čte z AsyncStorage manuálně zadané hodnoty
//   - AppleHealthProvider      — reálný HealthKit (přidá se s EAS prebuild)
//
// Pravidla:
//   * Žádná metoda nesmí throw na "data není dostupné". Vrátí prázdné pole
//     nebo null. Throw je rezervovaný pro programátorské chyby a sériový
//     výpadek (network HealthKit XPC fail apod.).
//   * Datumy jsou v lokální časové zóně uživatele (`YYYY-MM-DD`).
//   * Permission state je per-typ. `getPermissionStatus()` vrací aggregate.

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

export type HealthDataProviderName =
  | 'mock'
  | 'manual'
  | 'apple_health'
  | 'health_connect'
  | 'google_fit'
  | 'strava'
  | 'whoop'
  | 'garmin'
  | 'polar'
  | 'oura'
  | 'fitbit'
  | 'zepp'
  | 'composite';

export interface HealthDataProvider {
  /** Identifikátor implementace — pro logging / debug UI. */
  readonly name: HealthDataProviderName;

  /** True pokud na současné platformě může fungovat (iOS pro AppleHealth atd.). */
  isAvailable(): Promise<boolean>;

  /** Vrátí stav povolení pro všechny typy, které appka zatím požadovala. */
  getPermissionStatus(): Promise<HealthPermissionStatus>;

  /** Spustí permission dialog pro daný seznam typů. Vrátí finální stav. */
  requestPermissions(types: HealthDataType[]): Promise<HealthPermissionResult>;

  /** Denní souhrny aktivity (kroky, kcal) v inkluzivním rozsahu. */
  getDailyActivityRange(start: Date, end: Date): Promise<DailyActivitySummary[]>;

  /** Tréninky uskutečněné v daném časovém rozsahu. */
  getWorkoutSummaries(start: Date, end: Date): Promise<WorkoutSummary[]>;

  /** Nejnovější záznam tělesné hmotnosti, ne starší než `maxDaysOld`. */
  getLatestBodyWeight(maxDaysOld?: number): Promise<BodyWeightSample | null>;

  /** Spánkové souhrny v daném časovém rozsahu (datum = ráno probuzení). */
  getSleepSummary(start: Date, end: Date): Promise<SleepSummary[]>;

  /** Klidová tepová frekvence pro konkrétní den, pokud existuje. */
  getRestingHeartRate(date: Date): Promise<RestingHeartRateSample | null>;

  /** HRV pro konkrétní den, pokud existuje. */
  getHrv(date: Date): Promise<HrvSample | null>;
}
