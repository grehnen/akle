import type { GameReview } from "./game";

/** How much each kommun still away weighs in a loss at the guess limit. */
export const AWAY_WEIGHT_AT_LIMIT = 2;
/** How much each kommun still away weighs in a give-up, more than at the guess limit. */
export const AWAY_WEIGHT_GIVEN_UP = 3;
/** What each timeout adds to a score; each hint adds the same. */
export const TIMEOUT_COST = 1;
/** What a Perfect trip scores before its timeouts (it has no hints). */
export const PERFECT_SCORE = -1;

/**
 * A finished free-play trip's score, lower being better: a win's extra (−1 for Perfect), and for a
 * loss its guesses beyond the distance (none when fewer) plus 2 per kommun still away at the guess
 * limit (3 when given up); then one per hint and per timeout. A Perfect trip has no hints but can
 * have timeouts. Undefined while the trip is still being played.
 */
export function tripScore(review: GameReview): number | undefined {
  if (review.status === "playing") return undefined;
  const costs = review.hintsUsed + TIMEOUT_COST * review.timeouts;
  if (review.perfect) return PERFECT_SCORE + costs;
  if (review.status === "won") return (review.extra ?? 0) + costs;
  const awayWeight = review.givenUp ? AWAY_WEIGHT_GIVEN_UP : AWAY_WEIGHT_AT_LIMIT;
  return Math.max(0, review.cards.length - review.n) + awayWeight * review.away + costs;
}
