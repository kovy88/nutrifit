// ── APPLE HEALTH PROVIDER (placeholder)
//
// Skutečná HealthKit integrace vyžaduje:
//   1. EAS Build (Expo bare workflow nebo prebuild) — `expo run:ios` už máme,
//      ale Expo Go nestačí. App Store distribuce přes `eas build --platform ios`.
//   2. Native plugin — doporučuji `@kingstinct/react-native-healthkit` (RN 0.85+,
//      TS types, modernější API než stárnoucí `react-native-health`).
//   3. Config plugin v `app.json`, který přidá HealthKit entitlement +
//      `NSHealthShareUsageDescription` / `NSHealthUpdateUsageDescription`.
//   4. Permission flow UI (`features/health-sync/PermissionGate.tsx`).
//
// Tento soubor je INTERFACE-COMPLIANT STUB. Vrací 'unavailable', dokud reálná
// implementace nepřibude. Factory `createHealthDataProvider()` ho zatím
// nevolá — `MockHealthDataProvider` se použije místo něj, dokud nedoinstalujeme
// native plugin a neudoláme AppleHealthProvider v reálu.

import { Platform } from 'react-native';
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

export class AppleHealthProvider implements HealthDataProvider {
  readonly name = 'apple_health' as const;

  /** Static gate: vrací true jen na iOS, aniž bychom načítali native modul. */
  static isSupported(): boolean {
    return Platform.OS === 'ios';
  }

  async isAvailable(): Promise<boolean> {
    // TODO(ios): až bude nainstalovaný `@kingstinct/react-native-healthkit`,
    // zavolat `HealthKit.isHealthDataAvailable()` a vrátit jeho výsledek.
    return false;
  }

  async getPermissionStatus(): Promise<HealthPermissionStatus> {
    return 'unavailable';
  }

  async requestPermissions(types: HealthDataType[]): Promise<HealthPermissionResult> {
    // TODO(ios): HKHealthStore.requestAuthorization
    return { status: 'unavailable', granted: [], denied: types };
  }

  async getDailyActivityRange(_start: Date, _end: Date): Promise<DailyActivitySummary[]> {
    // TODO(ios): query HKQuantityType.stepCount, activeEnergyBurned,
    // basalEnergyBurned, distanceWalkingRunning, exerciseTime, standHour
    // pro každý den v rozsahu a agregovat.
    return [];
  }

  async getWorkoutSummaries(_start: Date, _end: Date): Promise<WorkoutSummary[]> {
    // TODO(ios): HKWorkoutType samples filtrované na rozsah.
    // Mapovat HKWorkoutActivityType → WorkoutKind.
    return [];
  }

  async getLatestBodyWeight(_maxDaysOld?: number): Promise<BodyWeightSample | null> {
    // TODO(ios): HKQuantityType.bodyMass, sortDescriptor desc, limit 1.
    return null;
  }

  async getSleepSummary(_start: Date, _end: Date): Promise<SleepSummary[]> {
    // TODO(ios): HKCategoryType.sleepAnalysis — agregovat na den.
    // Apple konvence: spánek se přiřazuje k datu probuzení (hranice 18:00).
    return [];
  }

  async getRestingHeartRate(_date: Date): Promise<RestingHeartRateSample | null> {
    // TODO(ios): HKQuantityType.restingHeartRate
    return null;
  }

  async getHrv(_date: Date): Promise<HrvSample | null> {
    // TODO(ios): HKQuantityType.heartRateVariabilitySDNN
    return null;
  }
}
