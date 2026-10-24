import type { GraphVersion, KommunCode } from "../graph/graphVersion";
import { cheapestRoute, routeCost, shortestRoute, shortestRouteLength } from "../graph/routes";
import { guessLimit } from "./guessLimit";
import { resolveKommunName } from "./kommunNames";

/** A start and a destination; a daily trip adds its trip number outside the engine. */
export type Trip = {
  start: KommunCode;
  destination: KommunCode;
};

/** What a game is played under, so a mode can change the rules without touching daily play. */
export type Rules = {
  /** `distance`: the daily guess limit, set by the distance; `none`: guess until the route is found. */
  guessLimit: "distance" | "none";
  /** Whether the player may give up once they've made as many guesses as the distance. */
  giveUp: boolean;
  /** Whether a win's time is kept: the real time from Starta to the winning guess. */
  keepsTime: boolean;
};

/** The daily-trip rules: the guess limit set by the distance, no giving up and no time. */
export const DAILY_RULES: Rules = { guessLimit: "distance", giveUp: false, keepsTime: false };

/**
 * A trip in progress under its rules: the accepted guesses, in order, and any hints taken.
 * Everything else is derived. `T` lets a daily game keep its trip number on the trip.
 */
export type Game<T extends Trip = Trip> = {
  trip: T;
  rules: Rules;
  guesses: readonly KommunCode[];
  /** Absent until the first hint is taken. */
  hints?: TakenHints;
  /** Set when the player gave up, which ends the trip as a loss. */
  givenUp?: true;
  /** When the trip started, at Starta, as a timestamp in milliseconds; set where time is kept. */
  startedAt?: number;
  /** When the winning guess was made, as a timestamp in milliseconds; set where time is kept. */
  wonAt?: number;
};

export type TakenHints = {
  /** 1 to 3. */
  taken: number;
  /** Hint 1's kommun, fixed when it was taken. */
  nextKommun: KommunCode;
};

export type Feedback = "✅" | "🟩" | "🟧" | "🟥";

export type GuessCard = {
  code: KommunCode;
  /** Fixed when the guess is made. */
  feedback: Feedback;
  /** Linked to the start through guesses right now; may turn true after later guesses. */
  connected: boolean;
};

export type GameStatus = "playing" | "won" | "lost";

export type GameReview = {
  n: number;
  /** Undefined when the rules set no guess limit. */
  limit?: number;
  status: GameStatus;
  /** A loss the player chose by giving up, rather than one at the guess limit. */
  givenUp: boolean;
  /** Whether giving up is allowed right now: the rules allow it and there are N guesses or more. */
  canGiveUp: boolean;
  cards: GuessCard[];
  /** Kommuner still missing from the cheapest route (the "k ifrån" on a loss). */
  away: number;
  /** Once the game is over, the cheapest route (tie-break as in `cheapestRoute`); the result view shows it. */
  cheapestRoute?: KommunCode[];
  /** Once the game is over, the shortest route with the most guesses on it (as in `shortestRoute`). */
  shortestRoute?: KommunCode[];
  /** On a loss, the kommuner on `cheapestRoute` that weren't guessed; empty otherwise. */
  missing: KommunCode[];
  /** On a win, guesses beyond N. */
  extra?: number;
  /** A win where every guess was ✅ and no hint was taken. */
  perfect: boolean;
  hintsUsed: number;
};

export type GuessResult<T extends Trip = Trip> =
  | { kind: "accepted"; game: Game<T>; card: GuessCard }
  | { kind: "rejected"; reason: "unknown" | "repeat" | "endpoint" | "game-over"; input: string };

export function newGame<T extends Trip>(trip: T, rules: Rules = DAILY_RULES): Game<T> {
  return { trip, rules, guesses: [] };
}

/** Resolves a typed name and adds it as a guess; rejected guesses are not counted. */
export function submitGuess<T extends Trip>(
  graph: GraphVersion,
  game: Game<T>,
  input: string,
): GuessResult<T> {
  if (reviewGame(graph, game).status !== "playing") {
    return { kind: "rejected", reason: "game-over", input };
  }
  const code = resolveKommunName(graph, input);
  if (code === undefined) return { kind: "rejected", reason: "unknown", input };
  if (code === game.trip.start || code === game.trip.destination) {
    return { kind: "rejected", reason: "endpoint", input };
  }
  if (game.guesses.includes(code)) return { kind: "rejected", reason: "repeat", input };

  const nextGame = { ...game, guesses: [...game.guesses, code] };
  const review = reviewGame(graph, nextGame);
  const card = review.cards[review.cards.length - 1] as GuessCard;
  return { kind: "accepted", game: nextGame, card };
}

/** Ends the trip as a loss when giving up is allowed; otherwise the game is returned as it was. */
export function giveUp<T extends Trip>(graph: GraphVersion, game: Game<T>): Game<T> {
  return reviewGame(graph, game).canGiveUp ? { ...game, givenUp: true } : game;
}

export function reviewGame(graph: GraphVersion, game: Game): GameReview {
  const { start, destination } = game.trip;
  const n = shortestRouteLength(graph, start, destination);

  const known = new Set<KommunCode>([start, destination]);
  // Each guess's distance after is the next guess's distance before, so it's searched once.
  let away = routeCost(graph, start, destination, known);
  const feedbacks: Feedback[] = [];
  for (const guess of game.guesses) {
    const rating = rateGuess(graph, start, destination, known, away, guess);
    feedbacks.push(rating.feedback);
    away = rating.distanceAfter;
    known.add(guess);
  }

  const connected = connectedTo(graph, start, game.guesses);
  const cards = game.guesses.map((code, index) => ({
    code,
    feedback: feedbacks[index] as Feedback,
    connected: connected.has(code),
  }));

  const limit = game.rules.guessLimit === "distance" ? guessLimit(n) : undefined;
  const givenUp = away !== 0 && game.givenUp === true;
  const status: GameStatus =
    away === 0
      ? "won"
      : givenUp || (limit !== undefined && cards.length >= limit)
        ? "lost"
        : "playing";

  const hintsUsed = game.hints?.taken ?? 0;
  const resultRoute =
    status === "playing" ? undefined : cheapestRoute(graph, start, destination, known);
  const missing = status === "lost" ? (resultRoute ?? []).filter((code) => !known.has(code)) : [];

  return {
    n,
    limit,
    status,
    givenUp,
    canGiveUp: status === "playing" && game.rules.giveUp && cards.length >= n,
    cards,
    away,
    cheapestRoute: resultRoute,
    shortestRoute:
      status === "playing"
        ? undefined
        : shortestRoute(graph, start, destination, new Set(game.guesses)),
    missing,
    extra: status === "won" ? cards.length - n : undefined,
    perfect: status === "won" && hintsUsed === 0 && cards.every((card) => card.feedback === "✅"),
    hintsUsed,
  };
}

function rateGuess(
  graph: GraphVersion,
  start: KommunCode,
  destination: KommunCode,
  knownBefore: ReadonlySet<KommunCode>,
  distanceBefore: number,
  guess: KommunCode,
): { feedback: Feedback; distanceAfter: number } {
  // A dead end is never passed through, so guessing one leaves the distance as it was.
  if (graph.deadEnds.has(guess)) return { feedback: "🟥", distanceAfter: distanceBefore };

  const knownAfter = new Set(knownBefore).add(guess);
  const distanceAfter = routeCost(graph, start, destination, knownAfter);
  if (distanceAfter < distanceBefore) {
    const guessesAfter = [...knownAfter].filter((code) => code !== start && code !== destination);
    const connectedNow = connectedTo(graph, start, guessesAfter).has(guess);
    return { feedback: connectedNow ? "✅" : "🟩", distanceAfter };
  }

  const detour =
    routeCost(graph, start, guess, knownAfter) + routeCost(graph, guess, destination, knownAfter);
  return { feedback: detour <= distanceBefore + 1 ? "🟧" : "🟥", distanceAfter };
}

/** Guesses connected to an endpoint through an unbroken chain of guesses (dead ends link nothing). */
export function connectedTo(
  graph: GraphVersion,
  endpoint: KommunCode,
  guesses: readonly KommunCode[],
): Set<KommunCode> {
  const passable = new Set(guesses.filter((code) => !graph.deadEnds.has(code)));
  const connected = new Set<KommunCode>();
  const queue = [endpoint];
  while (queue.length > 0) {
    const current = queue.shift() as KommunCode;
    for (const next of graph.neighbors.get(current) ?? []) {
      if (passable.has(next) && !connected.has(next)) {
        connected.add(next);
        queue.push(next);
      }
    }
  }
  return connected;
}
