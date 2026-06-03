// ── SECURE OAUTH TOKEN STORE (expo-secure-store backed)
//
// Bezpečnější varianta `AsyncStorageTokenStore` — používá iOS Keychain /
// Android Keystore místo plain AsyncStorage. Health-related tokeny (Strava,
// Whoop, Garmin, ...) jsou citlivé credentials; App Store security
// guidelines tlačí na encrypted storage.
//
// Pattern jako u ExpoNotificationScheduler / AppleHealthProvider:
// dynamický `import('expo-secure-store')` v každé metodě, fallback na
// `AsyncStorageTokenStore` pokud balíček chybí.
//
// Migration handler: pokud existuje token v old AsyncStorage, přesune ho
// do SecureStore a smaže ze starého místa (jednou per token per service).

import { AsyncStorageTokenStore, type OAuthService, type OAuthToken, type OAuthTokenStore } from './OAuthTokenStore';

const SECURE_PREFIX = 'nutrifit_oauth_'; // SecureStore key chars limit
const ALL_SERVICES: OAuthService[] = ['strava', 'whoop', 'garmin', 'polar', 'oura', 'fitbit'];

function isUnitTestRuntime(): boolean {
  return Boolean((globalThis as any).__NUTRIFIT_TEST__);
}

async function loadModule(): Promise<any | null> {
  if (isUnitTestRuntime()) return null;
  try {
    // @ts-ignore — expo-secure-store nemusí být v node_modules (optional native dep)
    const mod = await import('expo-secure-store');
    return mod;
  } catch {
    return null;
  }
}

/**
 * Returns true if expo-secure-store je dostupný. Pokud ne, factory fallbackne
 * na AsyncStorageTokenStore.
 */
export async function isSecureStoreAvailable(): Promise<boolean> {
  const mod = await loadModule();
  if (!mod) return false;
  try {
    return Boolean(await mod.isAvailableAsync?.());
  } catch {
    return false;
  }
}

export class SecureOAuthTokenStore implements OAuthTokenStore {
  /** Při prvním přístupu k danému service migrujeme token z AsyncStorage. */
  private migrated = new Set<OAuthService>();
  private fallback = new AsyncStorageTokenStore();

  async getToken(service: OAuthService): Promise<OAuthToken | null> {
    const mod = await loadModule();
    if (!mod) return this.fallback.getToken(service);

    // Migrate if needed
    if (!this.migrated.has(service)) {
      const existingAsync = await this.fallback.getToken(service);
      if (existingAsync) {
        try {
          await mod.setItemAsync(SECURE_PREFIX + service, JSON.stringify(existingAsync));
          await this.fallback.clearToken(service);
        } catch {
          /* fall through to read */
        }
      }
      this.migrated.add(service);
    }

    try {
      const raw = await mod.getItemAsync(SECURE_PREFIX + service);
      return raw ? (JSON.parse(raw) as OAuthToken) : null;
    } catch {
      return null;
    }
  }

  async setToken(service: OAuthService, token: OAuthToken): Promise<void> {
    const mod = await loadModule();
    if (!mod) return this.fallback.setToken(service, token);
    try {
      await mod.setItemAsync(SECURE_PREFIX + service, JSON.stringify(token));
      this.migrated.add(service);
    } catch {
      // Fallback if SecureStore write fails for any reason
      await this.fallback.setToken(service, token);
    }
  }

  async clearToken(service: OAuthService): Promise<void> {
    const mod = await loadModule();
    if (mod) {
      try {
        await mod.deleteItemAsync(SECURE_PREFIX + service);
      } catch {
        /* ignore */
      }
    }
    // Also clear AsyncStorage in case migration was partial
    await this.fallback.clearToken(service);
  }

  async listConnected(): Promise<OAuthService[]> {
    const mod = await loadModule();
    if (!mod) return this.fallback.listConnected();
    const out: OAuthService[] = [];
    for (const svc of ALL_SERVICES) {
      try {
        const raw = await mod.getItemAsync(SECURE_PREFIX + svc);
        if (raw) out.push(svc);
      } catch {
        /* ignore */
      }
    }
    // Also check AsyncStorage for non-migrated entries (fallback case)
    const asyncList = await this.fallback.listConnected();
    for (const svc of asyncList) if (!out.includes(svc)) out.push(svc);
    return out;
  }

  /** Wipe every OAuth token from BOTH stores. Used by account purge. */
  static async purge(): Promise<void> {
    const mod = await loadModule();
    if (mod) {
      for (const svc of ALL_SERVICES) {
        try {
          await mod.deleteItemAsync(SECURE_PREFIX + svc);
        } catch {
          /* ignore */
        }
      }
    }
    await AsyncStorageTokenStore.purge();
  }
}

/** Factory: returns SecureOAuthTokenStore in production, AsyncStorageTokenStore
 *  otherwise. Hooks should call this once and reuse the instance. */
export function createOAuthTokenStore(): OAuthTokenStore {
  // SecureStore detection is async; for the synchronous factory, we return
  // SecureOAuthTokenStore which internally falls back to AsyncStorage on
  // import failure. So either way the caller gets a working store.
  return new SecureOAuthTokenStore();
}
