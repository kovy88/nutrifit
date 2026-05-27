// ── lib/health barrel export
//
// Konzumenti importují přes `from '@/lib/health'`, ne přímo z konkrétních souborů.

export type { HealthDataProvider } from './HealthDataProvider';
export { MockHealthDataProvider } from './MockHealthDataProvider';
export type { MockHealthDataProviderOptions } from './MockHealthDataProvider';
export { ManualHealthDataProvider } from './ManualHealthDataProvider';
export { AppleHealthProvider } from './AppleHealthProvider';
export {
  createHealthDataProvider,
  type CreateHealthDataProviderOptions,
  type HealthDataProviderMode,
} from './factory';
export type {
  HealthDataType,
  HealthPermissionStatus,
  HealthPermissionResult,
  HealthDataSource,
  DailyActivitySummary,
  WorkoutKind,
  WorkoutSummary,
  SleepSummary,
  BodyWeightSample,
  RestingHeartRateSample,
  HrvSample,
} from '../../types/health';
