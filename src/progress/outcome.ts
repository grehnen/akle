import type { HistoryEntry } from "./history";

/** How a finished game went, as the result view, the share text and the stats tell it. */
export type Outcome =
  | { kind: "perfect"; extra: number }
  | { kind: "won"; extra: number; hintsUsed: number }
  | { kind: "lost"; hintsUsed: number };

export function classifyOutcome({
  won,
  extra,
  perfect,
  hintsUsed,
}: Pick<HistoryEntry, "won" | "extra" | "perfect" | "hintsUsed">): Outcome {
  if (!won) return { kind: "lost", hintsUsed };
  if (perfect) return { kind: "perfect", extra: extra ?? 0 };
  return { kind: "won", extra: extra ?? 0, hintsUsed };
}

/** `1 ledtråd`, `2 ledtrådar`. */
export function hintCount(hints: number): string {
  return hints === 1 ? "1 ledtråd" : `${hints} ledtrådar`;
}

/** ` (2 ledtrådar)` after a result when hints were used, else nothing. */
export function hintsNote(hintsUsed: number): string {
  return hintsUsed > 0 ? ` (${hintCount(hintsUsed)})` : "";
}
