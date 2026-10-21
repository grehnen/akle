import type { GraphVersion, KommunCode } from "../graph/graphVersion";
import { cheapestRoute, routeCost, shortestRouteLength } from "../graph/routes";
import { guessLimit } from "./guessLimit";
import { resolveKommunName } from "./kommunNames";

export type Puzzle = {
  number: number;
  start: KommunCode;
  destination: KommunCode;
};

/** A daily puzzle in progress: the accepted guesses, in order, and any hints taken. Everything else is derived. */
export type Game = {
  puzzle: Puzzle;
  guesses: readonly KommunCode[];
  /** Absent until the first hint is taken. */
  hints?: TakenHints;
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
  limit: number;
  status: GameStatus;
  cards: GuessCard[];
  /** Kommuner still missing from the cheapest route (the "k kvar" on a loss). */
  away: number;
  /**
   * Once the game is over, the cheapest route from start to destination, where guessed
   * kommuner are free (tie-break as in `cheapestRoute`); the result view shows it.
   */
  route?: KommunCode[];
  /** On a loss, the kommuner on `route` that weren't guessed; empty otherwise. */
  missing: KommunCode[];
  /** On a win, guesses beyond N. */
  extra?: number;
  /** A win where every guess was ✅ and no hint was taken. */
  perfect: boolean;
  hintsUsed: number;
};

export type GuessResult =
  | { kind: "accepted"; game: Game; card: GuessCard }
  | { kind: "rejected"; reason: "unknown" | "repeat" | "endpoint" | "game-over"; input: string };

export function newGame(puzzle: Puzzle): Game {
  return { puzzle, guesses: [] };
}

/** Resolves a typed name and adds it as a guess; rejected guesses are not counted. */
export function submitGuess(graph: GraphVersion, game: Game, input: string): GuessResult {
  if (reviewGame(graph, game).status !== "playing") {
    return { kind: "rejected", reason: "game-over", input };
  }
  const code = resolveKommunName(graph, input);
  if (code === undefined) return { kind: "rejected", reason: "unknown", input };
  if (code === game.puzzle.start || code === game.puzzle.destination) {
    return { kind: "rejected", reason: "endpoint", input };
  }
  if (game.guesses.includes(code)) return { kind: "rejected", reason: "repeat", input };

  const nextGame = { ...game, guesses: [...game.guesses, code] };
  const review = reviewGame(graph, nextGame);
  const card = review.cards[review.cards.length - 1] as GuessCard;
  return { kind: "accepted", game: nextGame, card };
}

export function reviewGame(graph: GraphVersion, game: Game): GameReview {
  const { start, destination } = game.puzzle;
  const n = shortestRouteLength(graph, start, destination);

  const known = new Set<KommunCode>([start, destination]);
  const feedbacks: Feedback[] = [];
  for (const guess of game.guesses) {
    feedbacks.push(rateGuess(graph, start, destination, known, guess));
    known.add(guess);
  }

  const connected = connectedToStart(graph, start, game.guesses);
  const cards = game.guesses.map((code, index) => ({
    code,
    feedback: feedbacks[index] as Feedback,
    connected: connected.has(code),
  }));

  const limit = guessLimit(n);
  const away = routeCost(graph, start, destination, known);
  const status: GameStatus = away === 0 ? "won" : cards.length >= limit ? "lost" : "playing";

  const hintsUsed = game.hints?.taken ?? 0;
  const route = status === "playing" ? undefined : cheapestRoute(graph, start, destination, known);
  const missing = status === "lost" ? (route ?? []).filter((code) => !known.has(code)) : [];

  return {
    n,
    limit,
    status,
    cards,
    away,
    route,
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
  guess: KommunCode,
): Feedback {
  if (graph.deadEnds.has(guess)) return "🟥";

  const knownAfter = new Set(knownBefore).add(guess);
  const distanceBefore = routeCost(graph, start, destination, knownBefore);
  const distanceAfter = routeCost(graph, start, destination, knownAfter);
  if (distanceAfter < distanceBefore) {
    const guessesAfter = [...knownAfter].filter((code) => code !== start && code !== destination);
    const connectedNow = connectedToStart(graph, start, guessesAfter).has(guess);
    return connectedNow ? "✅" : "🟩";
  }

  const detour =
    routeCost(graph, start, guess, knownAfter) + routeCost(graph, guess, destination, knownAfter);
  return detour <= distanceBefore + 1 ? "🟧" : "🟥";
}

/** Guesses linked to the start through an unbroken chain of guesses (dead ends link nothing). */
function connectedToStart(
  graph: GraphVersion,
  start: KommunCode,
  guesses: readonly KommunCode[],
): Set<KommunCode> {
  const passable = new Set(guesses.filter((code) => !graph.deadEnds.has(code)));
  const connected = new Set<KommunCode>();
  const queue = [start];
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
