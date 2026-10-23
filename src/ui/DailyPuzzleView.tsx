import type { DailyPuzzle } from "../daily/loadDailyPuzzle";
import { useState } from "react";
import { browserSessionStorage, browserStorage, type KeyValueStorage } from "../progress/storage";
import { PlayScreen } from "./PlayScreen";

type DailyPuzzleViewProps = {
  daily: DailyPuzzle | undefined;
  storage?: KeyValueStorage;
  /** Where view choices that last one browser session are kept; sessionStorage by default. */
  sessionStorage?: KeyValueStorage;
  now?: Date;
};

export function DailyPuzzleView({ daily, storage, sessionStorage, now }: DailyPuzzleViewProps) {
  const [fallbackStorage] = useState(browserStorage);
  const [fallbackSessionStorage] = useState(browserSessionStorage);
  const [openedAt] = useState(() => now ?? new Date());
  if (daily === undefined) {
    return <p>Laddar dagens pussel…</p>;
  }
  if (daily.kind === "no-puzzle") {
    return <p role="status">Inget pussel i dag. Titta in igen i morgon!</p>;
  }
  return (
    <PlayScreen
      key={daily.puzzle.number}
      graph={daily.graph}
      puzzle={daily.puzzle}
      storage={storage ?? fallbackStorage}
      sessionStorage={sessionStorage ?? fallbackSessionStorage}
      now={openedAt}
    />
  );
}
