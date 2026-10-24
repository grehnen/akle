import { useEffect, useState } from "react";

/**
 * What `load` gave, once it has; `failed` when it threw, logged to the console. Loads again
 * whenever `load` changes, so callers keep it stable with `useCallback` on what it reads. A
 * load overtaken by a newer one, or finishing after unmount, is dropped.
 */
export function useLoaded<T>(load: () => Promise<T>): { loaded?: T; failed: boolean } {
  const [loaded, setLoaded] = useState<T>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    load()
      .then((result) => {
        if (!cancelled) setLoaded(() => result);
      })
      .catch((error: unknown) => {
        console.error(error);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);
  return { loaded, failed };
}
