import { type Game, newGame, reviewGame } from "../engine/game";
import { tripScore } from "../engine/score";
import { stampThinkingTime, startTime, stopTimeAtWin } from "../engine/tripTime";
import type { GraphVersion } from "../graph/graphVersion";
import type { LinkedTrip } from "./linkPayload";
import { freePlayRules } from "./modeRules";

/**
 * Where an itinerary's play stands, as one plain value that can be stored: whether
 * `Starta resplanen` was pressed, the trip it is on (its card, board or trip end; past the last
 * trip once finished), and a game for each trip started so far, in order.
 */
export type ItineraryPlay = {
  begun: boolean;
  current: number;
  games: readonly Game[];
};

/** An itinerary not begun: its intro. */
export const NEW_ITINERARY_PLAY: ItineraryPlay = { begun: false, current: 0, games: [] };

/**
 * What an itinerary shows: its intro, a trip's card before `Starta`, a trip on the board (its
 * result once `over`), or the finish after the last trip.
 */
export type ItineraryStage =
  | { kind: "intro" }
  | { kind: "card"; index: number }
  | { kind: "trip"; index: number; game: Game; over: boolean }
  | { kind: "finished" };

export function itineraryStage(
  graph: GraphVersion,
  trips: readonly LinkedTrip[],
  play: ItineraryPlay,
): ItineraryStage {
  if (!play.begun) return { kind: "intro" };
  const index = play.current;
  if (index >= trips.length) return { kind: "finished" };
  const game = play.games[index];
  if (game === undefined) return { kind: "card", index };
  return { kind: "trip", index, game, over: reviewGame(graph, game).status !== "playing" };
}

/** `Starta resplanen`: from the intro to the first trip's card. */
export function beginItinerary(play: ItineraryPlay): ItineraryPlay {
  return play.begun ? play : { ...play, begun: true };
}

/**
 * `Starta` on a trip's card: the trip goes on the board under its own mode's rules, its time
 * started at `now`. A trip is started once, so anywhere but its card nothing changes.
 */
export function startTrip(
  trips: readonly LinkedTrip[],
  play: ItineraryPlay,
  now: number,
): ItineraryPlay {
  const trip = trips[play.current];
  if (!play.begun || trip === undefined || play.games.length !== play.current) return play;
  const { start, destination, mode } = trip;
  const game = startTime(newGame({ start, destination }, freePlayRules(mode)), now);
  return { ...play, games: [...play.games, game] };
}

/**
 * Takes the board's changed game for the trip being played, stamped at `now` for its time and
 * thinking time. Only the trip on the board can change.
 */
export function changeTripGame(
  graph: GraphVersion,
  play: ItineraryPlay,
  game: Game,
  now: number,
): ItineraryPlay {
  if (!play.begun || play.games[play.current] === undefined) return play;
  const stamped = stampThinkingTime(graph, stopTimeAtWin(graph, game, now), now);
  return {
    ...play,
    games: play.games.map((old, index) => (index === play.current ? stamped : old)),
  };
}

/**
 * `Nästa resa`: on to the next trip's card, or the finish after the last, only once the trip on
 * the board is over. A trip can't be skipped.
 */
export function nextTrip(graph: GraphVersion, play: ItineraryPlay): ItineraryPlay {
  const game = play.games[play.current];
  if (game === undefined || reviewGame(graph, game).status === "playing") return play;
  return { ...play, current: play.current + 1 };
}

/** The itinerary's running total: the sum of its finished trips' scores. */
export function itineraryTotal(graph: GraphVersion, play: ItineraryPlay): number {
  return play.games.reduce((total, game) => total + (tripScore(reviewGame(graph, game)) ?? 0), 0);
}
