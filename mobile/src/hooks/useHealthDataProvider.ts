import { useMemo } from 'react';
import { useTrenr } from '../context/TrenrContext';
import { createHealthDataProvider, type HealthDataProvider } from '../lib/health';

/**
 * Returns a stable HealthDataProvider instance for the lifetime of the app.
 *
 * Provider is selected automatically:
 *   - iOS + __DEV__ → Mock (deterministic, populated UI for development)
 *   - iOS + production → Manual (will switch to AppleHealth once native plugin lands)
 *   - Android / web → Manual
 *
 * Weight from profile seeds the mock so generated values track the user's reality.
 */
export function useHealthDataProvider(): HealthDataProvider {
  const { profile } = useTrenr();
  const weightKg = profile?.weight ?? 75;
  const mode = profile?.healthProviderMode ?? 'auto';
  // Providers are stateless w.r.t. weight beyond the mock seed — bucket into
  // steps of ~2kg so the memo only re-creates on substantial weight change.
  const weightBucket = Math.round(weightKg / 2);

  return useMemo(
    () => createHealthDataProvider({ mode, weightKg }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- weightBucket intentionally stands in for weightKg, see comment above
    [mode, weightBucket],
  );
}
