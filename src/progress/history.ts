import { type Game, type GuessCard, reviewGame } from "../engine/game";
import type { GraphVersion } from "../graph/graphVersion";
import { type KeyValueStorage, readJson, writeJson } from "./storage";

const HISTORY_KEY = "akle:history";

/** One finished daily puzzle, as the stats are derived from it. */
export type HistoryEntry = {
  won: boolean;
  /** Guesses beyond the shortest route on a win; null on a loss. */
  extra: number | null;
  perfect: boolean;
  hintsUsed: number;
  /** One ✅/🟩/🟧/🟥 per counted guess, in guess order. */
  emojiLine: string;
};

/** Finished games keyed by puzzle number. */
export type History = Record<number, HistoryEntry>;

export function emojiLine(cards: readonly Pick<GuessCard, "feedback">[]): string {
  return cards.map((card) => card.feedback).join("");
}

export function readHistory(storage: KeyValueStorage): History {
  const stored = readJson(storage, HISTORY_KEY);
  return typeof stored === "object" && stored !== null && !Array.isArray(stored)
    ? (stored as History)
    : {};
}

/** The history with a finished game's entry added once; an unfinished game or an already recorded puzzle is left alone. */
export function withFinishedGame(history: History, graph: GraphVersion, game: Game): History {
  const review = reviewGame(graph, game);
  if (review.status === "playing" || history[game.puzzle.number] !== undefined) return history;
  const entry: HistoryEntry = {
    won: review.status === "won",
    extra: review.extra ?? null,
    perfect: review.perfect,
    hintsUsed: review.hintsUsed,
    emojiLine: emojiLine(review.cards),
  };
  return { ...history, [game.puzzle.number]: entry };
}

/** Writes a finished game's entry once; an unfinished game or an already recorded puzzle is left alone. */
export function recordFinishedGame(
  storage: KeyValueStorage,
  graph: GraphVersion,
  game: Game,
): void {
  const history = readHistory(storage);
  const updated = withFinishedGame(history, graph, game);
  if (updated !== history) writeJson(storage, HISTORY_KEY, updated);
}
