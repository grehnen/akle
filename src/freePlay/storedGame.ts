import { type Game, giveUp, type Trip, newGame, reviewGame, type TakenHints } from "../engine/game";
import { stampThinkingTime, startTime, stopTimeAtWin } from "../engine/tripTime";
import type { GraphVersion, KommunCode } from "../graph/graphVersion";
import { restoreGame } from "../progress/savedGame";
import { isThinkingTime, type LinkedTrip, type ModeSetting } from "./linkPayload";
import { freePlayRules, opensAtStarta } from "./modeRules";

/**
 * A free-play game as a slot stores it: its guesses and whatever its mode keeps besides (a
 * give-up, a start time, timeouts), each an optional field.
 */
export type StoredGame = {
  guesses: KommunCode[];
  hints?: TakenHints;
  givenUp?: true;
  /** Timestamps in milliseconds: when Starta was pressed, and when the winning guess was made. */
  startedAt?: number;
  wonAt?: number;
  /** Timestamps of a timed trip: each counted guess, in order, and the end once it's over. */
  guessedAt?: number[];
  endedAt?: number;
};

export function storeGame(game: Game): StoredGame {
  return {
    guesses: [...game.guesses],
    ...(game.hints && { hints: game.hints }),
    ...(game.givenUp && { givenUp: true }),
    ...(game.startedAt !== undefined && { startedAt: game.startedAt }),
    ...(game.wonAt !== undefined && { wonAt: game.wonAt }),
    ...(game.guessedAt !== undefined && { guessedAt: [...game.guessedAt] }),
    ...(game.endedAt !== undefined && { endedAt: game.endedAt }),
  };
}

/**
 * A stored game of `trip`, played under `mode`'s rules and re-checked against the graph: its
 * guesses, hints and give-up, its start and win times, and a timed trip's guess and end times.
 * Undefined when what's stored can't be the game: a trip that opens at Starta without a start, a
 * timed trip without a time for every guess, or a finished one without its end.
 */
export function restoreStoredGame<T extends Trip>(
  graph: GraphVersion,
  trip: T,
  mode: ModeSetting,
  stored: unknown,
): Game<T> | undefined {
  if (!isRecord(stored) || !Array.isArray(stored.guesses)) return undefined;
  const { startedAt, wonAt, givenUp, guessedAt = [], endedAt } = stored as StoredGame;
  // A trip that opens at Starta is stored only once started, so one without a start is corrupt.
  if (opensAtStarta(mode) && !isTimestamp(startedAt)) return undefined;
  const fresh = newGame(trip, freePlayRules(mode));
  const restored = restoreGame(graph, fresh, stored as StoredGame);
  const game = isTimestamp(startedAt) ? startTime(restored, startedAt) : restored;
  // A give-up counts only where the restored game still allows one, a win time only on a win.
  const resumed = givenUp === true ? giveUp(graph, game) : game;
  const timed = isTimestamp(wonAt) ? stopTimeAtWin(graph, resumed, wonAt) : resumed;
  if (timed.rules.thinkingTime === undefined) return timed;

  // Timeouts are counted from the guess times, so a timed trip needs one for every guess, and
  // the time it ended once it's over.
  if (
    !Array.isArray(guessedAt) ||
    guessedAt.length !== timed.guesses.length ||
    !guessedAt.every(isTimestamp)
  ) {
    return undefined;
  }
  const withGuessTimes = { ...timed, ...(guessedAt.length > 0 && { guessedAt }) };
  const ended = isTimestamp(endedAt)
    ? stampThinkingTime(graph, withGuessTimes, endedAt)
    : withGuessTimes;
  if (ended.endedAt === undefined && reviewGame(graph, ended).status !== "playing") {
    return undefined;
  }
  return ended;
}

export const isTimestamp = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** Whether two linked trips are the same: endpoints, mode and thinking time. */
export function sameTrip(a: LinkedTrip, b: LinkedTrip): boolean {
  return (
    a.start === b.start &&
    a.destination === b.destination &&
    a.mode.kind === b.mode.kind &&
    thinkingTime(a.mode) === thinkingTime(b.mode)
  );
}

const thinkingTime = (mode: ModeSetting) => (mode.kind === "timed" ? mode.thinkingTime : undefined);

/** A stored linked trip, when it's whole: two codes and a valid mode. */
export function readTrip(stored: unknown): LinkedTrip | undefined {
  if (!isRecord(stored)) return undefined;
  const { start, destination, mode } = stored;
  if (typeof start !== "string" || typeof destination !== "string") return undefined;
  const setting = readMode(mode);
  return setting && { start, destination, mode: setting };
}

export const storeTrip = ({ start, destination, mode }: LinkedTrip): LinkedTrip => ({
  start,
  destination,
  mode,
});

function readMode(stored: unknown): ModeSetting | undefined {
  if (!isRecord(stored)) return undefined;
  const { kind, thinkingTime: seconds } = stored;
  if (kind === "standard" || kind === "unlimited" || kind === "tie-breaker") return { kind };
  if (kind === "timed" && isThinkingTime(seconds)) return { kind, thinkingTime: seconds };
  return undefined;
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A whole number at least 0. */
export const isCount = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0;
