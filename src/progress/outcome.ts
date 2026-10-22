import type { GameReview } from "../engine/game";
import type { HistoryEntry } from "./history";

type WonOutcome =
  | { kind: "perfect"; extra: number }
  | { kind: "won"; extra: number; hintsUsed: number };

/** How a finished game went, as the result view and the share text tell it. */
export type Outcome = WonOutcome | { kind: "lost"; hintsUsed: number; away: number };

/** How a recorded game went, as the stats count it; history doesn't keep a loss's `away`. */
export type RecordedOutcome = WonOutcome | { kind: "lost"; hintsUsed: number };

export function classifyOutcome({
  won,
  extra,
  perfect,
  hintsUsed,
}: Pick<HistoryEntry, "won" | "extra" | "perfect" | "hintsUsed">): RecordedOutcome {
  if (!won) return { kind: "lost", hintsUsed };
  return wonOutcome(extra ?? 0, perfect, hintsUsed);
}

/** A game's outcome from its review; undefined while it is still being played. */
export function gameOutcome(
  review: Pick<GameReview, "status" | "extra" | "perfect" | "away"> &
    Partial<Pick<GameReview, "hintsUsed">>,
): Outcome | undefined {
  const hintsUsed = review.hintsUsed ?? 0;
  switch (review.status) {
    case "playing":
      return undefined;
    case "lost":
      return { kind: "lost", hintsUsed, away: review.away };
    case "won":
      return wonOutcome(review.extra ?? 0, review.perfect, hintsUsed);
  }
}

function wonOutcome(extra: number, perfect: boolean, hintsUsed: number): WonOutcome {
  return perfect ? { kind: "perfect", extra } : { kind: "won", extra, hintsUsed };
}
