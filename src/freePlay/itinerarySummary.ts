import { reviewGame } from "../engine/game";
import { tripScore } from "../engine/score";
import { tripTime } from "../engine/tripTime";
import { type GraphVersion, kommunName } from "../graph/graphVersion";
import { gameOutcome, type Outcome } from "../progress/outcome";
import { type ItineraryPlay, itineraryStage } from "./itineraryPlay";
import type { LinkedTrip, ModeSetting } from "./linkPayload";

/** One finished trip of an itinerary, as its summary row shows it. */
export type ItinerarySummaryRow = {
  mode: ModeSetting;
  /** The start's and destination's names. */
  start: string;
  destination: string;
  outcome: Outcome;
  hintsUsed: number;
  /** Thinking times that ran out; only a timed trip has any. */
  timeouts: number;
  score: number;
  /** A won tie-breaker trip's time in tenths of a second; nothing else has one. */
  time?: number;
};

/**
 * What ranks a finished itinerary (the glossary's Standing): how many trips were won, the summed
 * score, and the summed time over its tie-breaker trips.
 */
export type ItineraryStanding = {
  tripsWon: number;
  score: number;
  /** The tie-breaker trips' summed time in tenths of a second; a lost one counts as 5 minutes. */
  tieBreakerTime: number;
};

/** What a lost tie-breaker trip counts as in a Standing's summed time. */
export const LOST_TIE_BREAKER_TIME_MS = 5 * 60 * 1000;
/** {@link LOST_TIE_BREAKER_TIME_MS} in tenths of a second, as a trip's time is kept. */
export const LOST_TIE_BREAKER_TIME = LOST_TIE_BREAKER_TIME_MS / 100;

export type ItinerarySummary = {
  rows: readonly ItinerarySummaryRow[];
  standing: ItineraryStanding;
};

/**
 * A finished itinerary's summary, from its trips and its play alone (so a stored play shows it
 * again); undefined until the last trip is over.
 */
export function itinerarySummary(
  graph: GraphVersion,
  trips: readonly LinkedTrip[],
  play: ItineraryPlay,
): ItinerarySummary | undefined {
  if (itineraryStage(graph, trips, play).kind !== "finished") return undefined;
  const rows = trips.map((trip, index): ItinerarySummaryRow => {
    const game = play.games[index];
    const review = reviewGame(graph, game);
    const outcome = gameOutcome(review);
    const score = tripScore(review);
    if (outcome === undefined || score === undefined) throw new Error(`trip ${index} is not over`);
    const time = tripTime(game);
    return {
      mode: trip.mode,
      start: kommunName(graph, trip.start),
      destination: kommunName(graph, trip.destination),
      outcome,
      hintsUsed: review.hintsUsed,
      timeouts: review.timeouts,
      score,
      ...(time !== undefined && { time }),
    };
  });
  const tripsLost = rows.filter((row) => row.outcome.kind === "lost").length;
  return {
    rows,
    standing: {
      tripsWon: rows.length - tripsLost,
      score: sum(rows.map((row) => row.score)),
      tieBreakerTime: sum(
        rows
          .filter((row) => row.mode.kind === "tie-breaker")
          .map((row) => row.time ?? LOST_TIE_BREAKER_TIME),
      ),
    },
  };
}

function sum(numbers: readonly number[]): number {
  return numbers.reduce((total, number) => total + number, 0);
}

/**
 * Orders two itinerary standings of the same itinerary, the better first (negative when `a` ranks
 * above `b`): more trips won, then the lower summed score, then the lower summed tie-breaker time.
 */
export function compareStandings(a: ItineraryStanding, b: ItineraryStanding): number {
  return b.tripsWon - a.tripsWon || a.score - b.score || a.tieBreakerTime - b.tieBreakerTime;
}
