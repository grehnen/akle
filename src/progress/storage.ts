/** The slice of the Web Storage API that progress is kept in. */
export type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function memoryStorage(): KeyValueStorage {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, String(value)),
    removeItem: (key) => void items.delete(key),
  };
}

/** localStorage when the browser allows it; otherwise progress lasts only until a reload. */
export function browserStorage(): KeyValueStorage {
  try {
    const storage = globalThis.localStorage;
    if (storage !== undefined) {
      storage.getItem("akle:game");
      return storage;
    }
  } catch {
    // Storage blocked, e.g. by privacy settings.
  }
  return memoryStorage();
}

export function readJson(storage: KeyValueStorage, key: string): unknown {
  try {
    const text = storage.getItem(key);
    return text === null ? undefined : JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function writeJson(storage: KeyValueStorage, key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Full or blocked storage: the game still plays, it just won't survive a reload.
  }
}
