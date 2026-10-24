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
 * What ranks a finished itinerary: its total score, then how many of its tie-breaker trips were
 * won, then their total time in tenths (only won tie-breaker trips add time).
 */
export type ItineraryStanding = {
  score: number;
  wonTieBreakers: number;
  totalTime: number;
};

export type ItinerarySummary = {
  rows: readonly ItinerarySummaryRow[];
  standing: ItineraryStanding;
  /** Whether any trip is in tie-breaker mode, so the total time is worth showing. */
  hasTieBreaker: boolean;
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
  const timed = rows.flatMap((row) => (row.time === undefined ? [] : [row.time]));
  return {
    rows,
    standing: {
      score: rows.reduce((total, row) => total + row.score, 0),
      wonTieBreakers: timed.length,
      totalTime: timed.reduce((total, time) => total + time, 0),
    },
    hasTieBreaker: trips.some((trip) => trip.mode.kind === "tie-breaker"),
  };
}

/**
 * Orders two itinerary results, the better first (negative when `a` ranks above `b`): the lower
 * score, then more won tie-breaker trips, then the lower total time.
 */
export function compareStandings(a: ItineraryStanding, b: ItineraryStanding): number {
  return a.score - b.score || b.wonTieBreakers - a.wonTieBreakers || a.totalTime - b.totalTime;
}
