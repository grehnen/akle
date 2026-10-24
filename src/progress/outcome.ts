import type { GameReview } from "../engine/game";
import type { HistoryEntry } from "./history";

/** `timeouts` counts a timed free-play trip's thinking times that ran out; absent when none. */
type WonOutcome =
  | { kind: "perfect"; extra: number }
  | { kind: "won"; extra: number; hintsUsed: number; timeouts?: number };

/** How a finished game went, as the result view and the share text tell it. */
export type Outcome =
  | WonOutcome
  /** `givenUp` marks a free-play give-up; a daily trip only loses at the guess limit. */
  | { kind: "lost"; hintsUsed: number; away: number; givenUp?: true; timeouts?: number };

/** How a recorded game went, as the stats count it; history doesn't keep a loss's `away`. */
export type RecordedOutcome = WonOutcome | { kind: "lost"; hintsUsed: number };

export function classifyOutcome({
  won,
  extra,
  perfect,
  hintsUsed,
}: Pick<HistoryEntry, "won" | "extra" | "perfect" | "hintsUsed">): RecordedOutcome {
  if (!won) return { kind: "lost", hintsUsed };
  return wonOutcome(extra ?? 0, perfect, hintsUsed, 0);
}

/** A game's outcome from its review; undefined while it is still being played. */
export function gameOutcome(
  review: Pick<GameReview, "status" | "extra" | "perfect" | "away"> &
    Partial<Pick<GameReview, "hintsUsed" | "givenUp" | "timeouts">>,
): Outcome | undefined {
  const hintsUsed = review.hintsUsed ?? 0;
  const timeouts = review.timeouts ?? 0;
  switch (review.status) {
    case "playing":
      return undefined;
    case "lost":
      return {
        kind: "lost",
        hintsUsed,
        away: review.away,
        ...(review.givenUp && { givenUp: true }),
        ...(timeouts > 0 && { timeouts }),
      };
    case "won":
      return wonOutcome(review.extra ?? 0, review.perfect, hintsUsed, timeouts);
  }
}

function wonOutcome(
  extra: number,
  perfect: boolean,
  hintsUsed: number,
  timeouts: number,
): WonOutcome {
  if (perfect) return { kind: "perfect", extra };
  return { kind: "won", extra, hintsUsed, ...(timeouts > 0 && { timeouts }) };
}
