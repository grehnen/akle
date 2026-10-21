import type { DailyPuzzle } from "../daily/loadDailyPuzzle";
import { PlayScreen } from "./PlayScreen";

export function DailyPuzzleView({ daily }: { daily: DailyPuzzle | undefined }) {
  if (daily === undefined) {
    return <p>Laddar dagens pussel…</p>;
  }
  if (daily.kind === "no-puzzle") {
    return <p role="status">Inget pussel i dag. Titta in igen i morgon!</p>;
  }
  return <PlayScreen key={daily.puzzle.number} graph={daily.graph} puzzle={daily.puzzle} />;
}
