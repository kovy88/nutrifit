// ── lib/health barrel export
//
// Konzumenti importují přes `from '@/lib/health'`, ne přímo z konkrétních souborů.

export type { HealthDataProvider, HealthDataProviderName } from './HealthDataProvider';
export { MockHealthDataProvider } from './MockHealthDataProvider';
export type { MockHealthDataProviderOptions } from './MockHealthDataProvider';
export { ManualHealthDataProvider } from './ManualHealthDataProvider';
export { AppleHealthProvider } from './AppleHealthProvider';
export { HealthConnectProvider } from './HealthConnectProvider';
export { StravaProvider } from './StravaProvider';
export { WhoopProvider } from './WhoopProvider';
export { CompositeHealthDataProvider } from './CompositeHealthDataProvider';
export {
  AsyncStorageTokenStore,
  isExpired,
  type OAuthToken,
  type OAuthService,
  type OAuthTokenStore,
} from './oauth/OAuthTokenStore';
export {
  SecureOAuthTokenStore,
  createOAuthTokenStore,
  isSecureStoreAvailable,
} from './oauth/SecureOAuthTokenStore';
export {
  StravaOAuth,
  parseQuery,
  type StravaOAuthConfig,
  type StravaConnectResult,
} from './oauth/StravaOAuth';
export {
  WhoopOAuth,
  type WhoopOAuthConfig,
  type WhoopConnectResult,
} from './oauth/WhoopOAuth';
export {
  GarminOAuth,
  sha256Base64Url,
  base64UrlEncode,
  type GarminOAuthConfig,
  type GarminConnectResult,
} from './oauth/GarminOAuth';
export {
  OuraOAuth,
  type OuraOAuthConfig,
  type OuraConnectResult,
} from './oauth/OuraOAuth';
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
  HealthDataCompleteness,
  HealthDataSummary,
} from '../../types/health';
