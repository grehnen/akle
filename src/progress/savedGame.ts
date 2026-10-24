import type { DailyTrip } from "../daily/dailyTrip";
import { type Game, newGame, type TakenHints, type Trip } from "../engine/game";
import { HINT_COUNT } from "../engine/hints";
import type { GraphVersion, KommunCode } from "../graph/graphVersion";
import { type KeyValueStorage, readJson, writeJson } from "./storage";

const GAME_KEY = "akle:game";

type StoredGame = {
  tripNumber: number;
  guesses: KommunCode[];
  hints?: TakenHints;
};

export function saveGame(
  storage: KeyValueStorage,
  game: Pick<Game<DailyTrip>, "trip" | "guesses" | "hints">,
): void {
  const stored: StoredGame = {
    tripNumber: game.trip.number,
    guesses: [...game.guesses],
    ...(game.hints && { hints: game.hints }),
  };
  writeJson(storage, GAME_KEY, stored);
}

/** Today's game as last saved, or a fresh one when the saved game is for another trip number. */
export function loadSavedGame(
  storage: KeyValueStorage,
  graph: GraphVersion,
  trip: DailyTrip,
): Game<DailyTrip> {
  const stored = readJson(storage, GAME_KEY) as Partial<StoredGame> | undefined;
  if (stored?.tripNumber !== trip.number || !Array.isArray(stored.guesses)) {
    return newGame(trip);
  }
  return restoreGame(graph, newGame(trip), stored);
}

/**
 * A fresh game with the stored guesses and hints put back, keeping only what is still valid on
 * the graph: known, new kommuner other than the trip's ends, and a hint count in range.
 */
export function restoreGame<T extends Trip>(
  graph: GraphVersion,
  fresh: Game<T>,
  stored: { guesses?: unknown; hints?: unknown },
): Game<T> {
  const { trip } = fresh;
  const guesses: KommunCode[] = [];
  for (const code of Array.isArray(stored.guesses) ? (stored.guesses as unknown[]) : []) {
    if (
      typeof code === "string" &&
      graph.kommuner.has(code) &&
      code !== trip.start &&
      code !== trip.destination &&
      !guesses.includes(code)
    ) {
      guesses.push(code);
    }
  }
  const hints = readHints(graph, stored.hints);
  const game = { ...fresh, guesses };
  return hints ? { ...game, hints } : game;
}

function readHints(graph: GraphVersion, stored: unknown): TakenHints | undefined {
  if (typeof stored !== "object" || stored === null) return undefined;
  const { taken, nextKommun } = stored as Partial<Record<keyof TakenHints, unknown>>;
  if (!Number.isInteger(taken) || (taken as number) < 1 || (taken as number) > HINT_COUNT) {
    return undefined;
  }
  if (typeof nextKommun !== "string" || !graph.kommuner.has(nextKommun)) return undefined;
  return { taken: taken as number, nextKommun };
}
