// In-memory AsyncStorage stub pro Vitest. Stejný API tvar jako reálný RN modul.
// Resetuje se mezi testy, pokud test volá AsyncStorage.clear() / multiRemove.

const store = new Map<string, string>();

const AsyncStorage = {
  async getItem(key: string): Promise<string | null> {
    return store.has(key) ? (store.get(key) as string) : null;
  },
  async setItem(key: string, value: string): Promise<void> {
    store.set(key, value);
  },
  async removeItem(key: string): Promise<void> {
    store.delete(key);
  },
  async multiRemove(keys: readonly string[]): Promise<void> {
    for (const k of keys) store.delete(k);
  },
  async multiGet(keys: readonly string[]): Promise<[string, string | null][]> {
    return keys.map(k => [k, store.has(k) ? (store.get(k) as string) : null]);
  },
  async multiSet(pairs: readonly [string, string][]): Promise<void> {
    for (const [k, v] of pairs) store.set(k, v);
  },
  async getAllKeys(): Promise<string[]> {
    return Array.from(store.keys());
  },
  async clear(): Promise<void> {
    store.clear();
  },
};

export default AsyncStorage;
