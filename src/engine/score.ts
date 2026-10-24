import type { GameReview } from "./game";

/** How much each kommun still away weighs in a loss at the guess limit. */
const AWAY_WEIGHT_AT_LIMIT = 2;
/** How much each kommun still away weighs in a give-up, more than at the guess limit. */
const AWAY_WEIGHT_GIVEN_UP = 3;

/**
 * A finished free-play trip's score, lower being better: a win's extra plus one per hint, −1 for
 * Perfect, and for a loss at the guess limit its guesses beyond the distance, plus 2 per kommun
 * still away (3 when given up), plus one per hint. Undefined while the trip is still being played.
 */
export function tripScore(review: GameReview): number | undefined {
  if (review.status === "playing") return undefined;
  if (review.perfect) return -1;
  if (review.status === "won") return (review.extra ?? 0) + review.hintsUsed;
  const awayWeight = review.givenUp ? AWAY_WEIGHT_GIVEN_UP : AWAY_WEIGHT_AT_LIMIT;
  return review.cards.length - review.n + awayWeight * review.away + review.hintsUsed;
}
