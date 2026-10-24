import type { DailyTrip } from "../daily/loadDailyTrip";
import { useState } from "react";
import { browserSessionStorage, browserStorage, type KeyValueStorage } from "../progress/storage";
import { PlayScreen } from "./PlayScreen";

type DailyTripViewProps = {
  daily: DailyTrip | undefined;
  storage?: KeyValueStorage;
  /** Where view choices that last one browser session are kept; sessionStorage by default. */
  sessionStorage?: KeyValueStorage;
  now?: Date;
};

export function DailyTripView({ daily, storage, sessionStorage, now }: DailyTripViewProps) {
  const [fallbackStorage] = useState(browserStorage);
  const [fallbackSessionStorage] = useState(browserSessionStorage);
  const [openedAt] = useState(() => now ?? new Date());
  if (daily === undefined) {
    return <p>Laddar dagens resa…</p>;
  }
  if (daily.kind === "no-trip") {
    return <p role="status">Ingen resa i dag. Titta in igen i morgon!</p>;
  }
  return (
    <PlayScreen
      key={daily.trip.number}
      graph={daily.graph}
      trip={daily.trip}
      storage={storage ?? fallbackStorage}
      sessionStorage={sessionStorage ?? fallbackSessionStorage}
      now={openedAt}
    />
  );
}
