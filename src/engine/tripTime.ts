import type { GraphVersion } from "../graph/graphVersion";
import { type Game, reviewGame, type Trip } from "./game";

/** Starts the trip's time at `now`, as `Starta` does. */
export function startTime<T extends Trip>(game: Game<T>, now: number): Game<T> {
  return { ...game, startedAt: now };
}

/**
 * Stops the time at `now` when the game, just changed, is won with its time running: called after
 * every change, it stamps only the winning guess. Any other game is returned as it was.
 */
export function stopTimeAtWin<T extends Trip>(
  graph: GraphVersion,
  game: Game<T>,
  now: number,
): Game<T> {
  if (!game.rules.keepsTime || game.startedAt === undefined || game.wonAt !== undefined) {
    return game;
  }
  return reviewGame(graph, game).status === "won" ? { ...game, wonAt: now } : game;
}

/**
 * Stamps a timed game, just changed, at `now`: each counted guess not yet stamped (only a counted
 * guess starts the thinking time again), and the end once the game is over. Called after every
 * change; a game with no thinking time, or not started, is returned as it was.
 */
export function stampThinkingTime<T extends Trip>(
  graph: GraphVersion,
  game: Game<T>,
  now: number,
): Game<T> {
  if (game.rules.thinkingTime === undefined || game.startedAt === undefined) return game;
  const stamped = game.guessedAt ?? [];
  const unstamped = game.guesses.length - stamped.length;
  const guessedAt =
    unstamped > 0 ? [...stamped, ...Array<number>(unstamped).fill(now)] : game.guessedAt;
  const ended = game.endedAt === undefined && reviewGame(graph, game).status !== "playing";
  if (guessedAt === game.guessedAt && !ended) return game;
  return { ...game, guessedAt, ...(ended && { endedAt: now }) };
}

/** Milliseconds since Starta, as the running clock shows them; the clock stops at the win. */
export function elapsedTime(game: Game, now: number): number {
  if (game.startedAt === undefined) return 0;
  return Math.max(0, (game.wonAt ?? now) - game.startedAt);
}

/** A win's time in whole tenths of a second, as it is kept and compared; none for anything else. */
export function tripTime(game: Game): number | undefined {
  if (!game.rules.keepsTime || game.startedAt === undefined || game.wonAt === undefined) {
    return undefined;
  }
  return Math.floor(Math.max(0, game.wonAt - game.startedAt) / 100);
}
