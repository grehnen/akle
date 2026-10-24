import { useEffect, useState } from "react";
import type { DailyTripSource } from "../daily/loadDailyTrip";
import { loadCurrentGraphVersion } from "../freePlay/currentVersion";
import type { GraphVersion } from "../graph/graphVersion";
import { browserSessionStorage, type KeyValueStorage } from "../progress/storage";
import { FreePlayScreen } from "./FreePlayScreen";

type FreePlayViewProps = {
  source: DailyTripSource;
  now: Date;
  /** Where view choices that last one browser session are kept; sessionStorage by default. */
  sessionStorage?: KeyValueStorage;
};

/** Loads the current version, then shows free play on it. */
export function FreePlayView({ source, now, sessionStorage }: FreePlayViewProps) {
  const [graph, setGraph] = useState<GraphVersion>();
  const [failed, setFailed] = useState(false);
  const [fallbackSessionStorage] = useState(browserSessionStorage);

  useEffect(() => {
    let cancelled = false;
    loadCurrentGraphVersion(source, now)
      .then((loaded) => !cancelled && setGraph(loaded))
      .catch((error: unknown) => {
        console.error(error);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [source, now]);

  if (failed) return <p role="alert">Kunde inte ladda fri resa. Försök igen senare.</p>;
  if (graph === undefined) return <p>Laddar fri resa…</p>;
  return <FreePlayScreen graph={graph} sessionStorage={sessionStorage ?? fallbackSessionStorage} />;
}
