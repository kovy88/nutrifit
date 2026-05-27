// ── HEALTH DATA PROVIDER FACTORY
//
// Volá se jednou při startu app. Vybere providera podle platformy a uložené
// preference. UI hookuje `useHealthDataProvider()`, ne přímo factory.
//
// Strategie výběru:
//   1. Explicitní override (`mode: 'mock' | 'manual'`) — vývoj a testy.
//   2. iOS s reálným HealthKit pluginem → AppleHealthProvider
//      (do té doby vrací 'unavailable' a fallback → manual nebo mock).
//   3. Vše ostatní → ManualHealthDataProvider (uživatel zapisuje ručně).
//
// `mock` je výchozí v dev modu, aby HomeScreen měl co zobrazit.

import { Platform } from 'react-native';
import { AppleHealthProvider } from './AppleHealthProvider';
import { ManualHealthDataProvider } from './ManualHealthDataProvider';
import { MockHealthDataProvider, type MockHealthDataProviderOptions } from './MockHealthDataProvider';
import type { HealthDataProvider } from './HealthDataProvider';

export type HealthDataProviderMode = 'auto' | 'mock' | 'manual' | 'apple_health';

export type CreateHealthDataProviderOptions = {
  mode?: HealthDataProviderMode;
  weightKg?: number;
  mock?: MockHealthDataProviderOptions;
};

export function createHealthDataProvider(opts: CreateHealthDataProviderOptions = {}): HealthDataProvider {
  const mode = opts.mode ?? 'auto';

  if (mode === 'mock') {
    return new MockHealthDataProvider({ weightKg: opts.weightKg, ...opts.mock });
  }
  if (mode === 'manual') {
    return new ManualHealthDataProvider();
  }
  if (mode === 'apple_health') {
    // Bypass auto-detection; useful for testing flow even before native plugin lands.
    return new AppleHealthProvider();
  }

  // auto: iOS → AppleHealth (zatím stub → unavailable → fallback);
  //       jinak → Manual (uživatel zapisuje sám)
  if (Platform.OS === 'ios' && AppleHealthProvider.isSupported()) {
    // V budoucnu (po EAS prebuild + native plugin) vrátí reálná data.
    // Dnes vrací 'unavailable' — proto vracíme MOCK pro vývoj, aby UI nebylo prázdné.
    if (__DEV__) {
      return new MockHealthDataProvider({ weightKg: opts.weightKg, ...opts.mock });
    }
    return new ManualHealthDataProvider();
  }

  return new ManualHealthDataProvider();
}
