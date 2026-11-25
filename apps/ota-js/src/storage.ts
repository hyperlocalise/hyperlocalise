/**
 * Key-value store the client uses to keep the last release between app starts.
 * Methods may be sync (`localStorage`) or async (React Native AsyncStorage).
 */
export interface OtaStorage {
  getItem(key: string): string | null | undefined | Promise<string | null | undefined>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

export function createMemoryStorage(): OtaStorage {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
}

/**
 * Uses `window.localStorage` when it exists and works (private mode and some
 * webviews throw on write), otherwise an in-memory store.
 */
export function createLocalStorage(): OtaStorage {
  try {
    const storage = (globalThis as { localStorage?: Storage }).localStorage;
    if (storage) {
      const probe = "__hlota_probe__";
      storage.setItem(probe, "1");
      storage.removeItem(probe);
      return storage;
    }
  } catch {
    // Fall through to memory.
  }
  return createMemoryStorage();
}

export async function readJson<T>(storage: OtaStorage, key: string): Promise<T | undefined> {
  try {
    const raw = await storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

export async function writeJson(storage: OtaStorage, key: string, value: unknown): Promise<void> {
  try {
    await storage.setItem(key, JSON.stringify(value));
  } catch {
    // A full or unavailable store must not break translations.
  }
}
