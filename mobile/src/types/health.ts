// ── HEALTH DATA TYPES
//
// Doménové typy pro fitness/health data — kroky, tréninky, spánek, váha, HR/HRV.
// Žádný native binding tady není; reálná HealthKit/Google Fit integrace se
// dělá ve `lib/health/AppleHealthProvider` resp. `GoogleFitProvider` později.

/** Kategorie zdravotních dat, na které appka může chtít přístup. */
export type HealthDataType =
  | 'steps'
  | 'activeEnergy'
  | 'basalEnergy'
  | 'distanceWalkingRunning'
  | 'heartRate'
  | 'restingHeartRate'
  | 'hrv'
  | 'bodyMass'
  | 'bodyFatPercentage'
  | 'sleepAnalysis'
  | 'workout';

/** Stav povolení k Apple Health / Google Fit. */
export type HealthPermissionStatus =
  | 'not_determined' // uživatel ještě nedostal dialog
  | 'denied'         // uživatel odmítl všechny typy
  | 'partial'        // některé typy povolené, jiné ne
  | 'granted'        // všechny požadované typy povolené
  | 'unavailable';   // platforma neumí (Android bez Google Fit, web)

/** Výsledek requestu na povolení. */
export type HealthPermissionResult = {
  status: HealthPermissionStatus;
  granted: HealthDataType[];
  denied: HealthDataType[];
};

/** Zdroj dat — odkud konkrétní záznam pochází. Důležité pro filtrování
 *  manuálních zápisů (často nepřesné) vs. wearable (Apple Watch, Garmin). */
export type HealthDataSource =
  | 'apple_health'
  | 'apple_watch'
  | 'health_connect'   // Android unified API (Samsung Health, Fitbit, Garmin sync sem)
  | 'google_fit'       // legacy, postupně nahrazen Health Connect
  | 'strava'           // OAuth REST API
  | 'whoop'            // OAuth REST API
  | 'garmin'           // OAuth REST API (partner)
  | 'polar'            // AccessLink OAuth
  | 'oura'             // OAuth REST API
  | 'fitbit'           // OAuth REST API
  | 'zepp'             // CSV import (Zepp app nemá public API)
  | 'suunto'           // pouze přes Strava sync
  | 'mock'
  | 'manual';

/** Denní souhrn aktivity (kroky, aktivní/bazální kalorie, vzdálenost).
 *  Jeden záznam = jeden den v lokální časové zóně uživatele. */
export type DailyActivitySummary = {
  date: string;                  // ISO YYYY-MM-DD v lokální TZ
  steps: number;
  activeEnergyKcal: number;
  basalEnergyKcal?: number;
  distanceKm?: number;
  exerciseMinutes?: number;
  standHours?: number;
  source: HealthDataSource;
};

/** Druh tréninku jak ho hlásí HealthKit / Google Fit / manuální zápis. */
export type WorkoutKind =
  | 'run'
  | 'walk'
  | 'cycle'
  | 'swim'
  | 'strength'
  | 'hiit'
  | 'yoga'
  | 'functional'
  | 'rowing'
  | 'other';

export type WorkoutSummary = {
  id: string;
  startedAt: string;             // ISO 8601 with TZ
  endedAt: string;
  kind: WorkoutKind;
  durationMinutes: number;
  distanceKm?: number;
  avgPaceSecPerKm?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  activeEnergyKcal?: number;
  source: HealthDataSource;
  /** Externí ID z HealthKitu nebo Garminu — pro deduplikaci. */
  externalId?: string;
};

/** Spánkový souhrn za noc — typicky agregace mezi 18:00 předchozího dne
 *  a 18:00 daného dne (Apple Health konvence). */
export type SleepSummary = {
  date: string;                  // datum ráno, kdy se uživatel probudil
  totalMinutes: number;
  deepMinutes?: number;
  remMinutes?: number;
  awakeMinutes?: number;
  efficiency?: number;           // 0..1
  source: HealthDataSource;
};

/** Vzorek tělesné hmotnosti — k některému datu. */
export type BodyWeightSample = {
  date: string;
  weightKg: number;
  source: HealthDataSource;
};

/** Klidová tepová frekvence (RHR) — beats per minute, jedno číslo per den. */
export type RestingHeartRateSample = {
  date: string;
  bpm: number;
  source: HealthDataSource;
};

/** Heart rate variability (HRV) — RMSSD nebo SDNN v ms. Apple poskytuje SDNN. */
export type HrvSample = {
  date: string;
  ms: number;
  metric: 'sdnn' | 'rmssd';
  source: HealthDataSource;
};
