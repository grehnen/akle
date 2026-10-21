import type { DailyPuzzle } from "../daily/loadDailyPuzzle";
import { useState } from "react";
import { browserStorage, type KeyValueStorage } from "../progress/storage";
import { PlayScreen } from "./PlayScreen";

type DailyPuzzleViewProps = {
  daily: DailyPuzzle | undefined;
  storage?: KeyValueStorage;
  now?: Date;
};

export function DailyPuzzleView({ daily, storage, now }: DailyPuzzleViewProps) {
  const [fallbackStorage] = useState(browserStorage);
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
      now={openedAt}
    />
  );
}
