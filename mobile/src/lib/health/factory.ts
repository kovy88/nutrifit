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
import { CompositeHealthDataProvider } from './CompositeHealthDataProvider';
import { HealthConnectProvider } from './HealthConnectProvider';
import { ManualHealthDataProvider } from './ManualHealthDataProvider';
import { MockHealthDataProvider, type MockHealthDataProviderOptions } from './MockHealthDataProvider';
import { OuraProvider } from './OuraProvider';
import { StravaProvider } from './StravaProvider';
import { WhoopProvider } from './WhoopProvider';
import { type OAuthTokenStore } from './oauth/OAuthTokenStore';
import { createOAuthTokenStore } from './oauth/SecureOAuthTokenStore';
import type { HealthDataProvider } from './HealthDataProvider';

export type HealthDataProviderMode =
  | 'auto'             // chytrý výběr podle platformy + dostupných OAuth tokenů
  | 'mock'
  | 'manual'
  | 'apple_health'
  | 'health_connect'
  | 'strava'
  | 'whoop'
  | 'oura';

export type CreateHealthDataProviderOptions = {
  mode?: HealthDataProviderMode;
  weightKg?: number;
  mock?: MockHealthDataProviderOptions;
  /** Token store pro OAuth providery. Default = SecureOAuthTokenStore (iOS
   *  Keychain / Android Keystore via expo-secure-store; falls back to
   *  AsyncStorage if the package is missing). */
  tokenStore?: OAuthTokenStore;
};

export function createHealthDataProvider(opts: CreateHealthDataProviderOptions = {}): HealthDataProvider {
  const mode = opts.mode ?? 'auto';
  const tokens = opts.tokenStore ?? createOAuthTokenStore();

  if (mode === 'mock')         return new MockHealthDataProvider({ weightKg: opts.weightKg, ...opts.mock });
  if (mode === 'manual')       return new ManualHealthDataProvider();
  if (mode === 'apple_health') return new AppleHealthProvider();
  if (mode === 'health_connect') return new HealthConnectProvider();
  if (mode === 'strava')       return new StravaProvider(tokens);
  if (mode === 'whoop')        return new WhoopProvider(tokens);
  if (mode === 'oura')         return new OuraProvider(tokens);

  // ── auto mode ──────────────────────────────────────────────────────────────
  //
  // Vrátíme CompositeHealthDataProvider s priority pořadím:
  //   1. native (Apple Health / Health Connect) — primárně steps, sleep, RHR
  //   2. Strava — pokud připojeno, dostává prioritu pro workouts
  //   3. Whoop  — pokud připojeno, prioritní pro HRV / recovery
  //   4. Oura   — pokud připojeno, doplní HRV/RHR/sleep, když Whoop není
  //   5. Manual — fallback pro vše, co se zapisuje ručně
  //
  // Composite všechno dotáže najednou a zmerguje, takže UI nemusí řešit
  // "odkud to vlastně přišlo". Dedup workoutů řeší Composite sám.
  const providers: HealthDataProvider[] = [];

  // Native: Apple Health (iOS) nebo Health Connect (Android). Stuby vrací []
  // dokud nebude nainstalovaný native plugin — neškodí být v compositu.
  if (Platform.OS === 'ios' && AppleHealthProvider.isSupported()) {
    providers.push(new AppleHealthProvider());
  } else if (Platform.OS === 'android' && HealthConnectProvider.isSupported()) {
    providers.push(new HealthConnectProvider());
  }

  // OAuth providery — composite je obsahuje vždy; když uživatel není připojený,
  // jejich isAvailable() vrátí false a getX() vrátí prázdná pole, takže
  // composite je transparentně přeskočí.
  providers.push(new StravaProvider(tokens));
  providers.push(new WhoopProvider(tokens));
  providers.push(new OuraProvider(tokens));

  // V dev modu přidáme Mock jako poslední — UI dostane data i bez setupu.
  // V produkci přidáme Manual jako fallback pro váhu / kroky / spánek.
  if (__DEV__) {
    providers.push(new MockHealthDataProvider({ weightKg: opts.weightKg, ...opts.mock }));
  } else {
    providers.push(new ManualHealthDataProvider());
  }

  return new CompositeHealthDataProvider(providers);
}
