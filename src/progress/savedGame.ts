import { type Game, newGame, type Puzzle } from "../engine/game";
import type { GraphVersion, KommunCode } from "../graph/graphVersion";
import { type KeyValueStorage, readJson, writeJson } from "./storage";

const GAME_KEY = "akle:game";

type StoredGame = {
  puzzleNumber: number;
  guesses: KommunCode[];
};

export function saveGame(storage: KeyValueStorage, game: Game): void {
  const stored: StoredGame = { puzzleNumber: game.puzzle.number, guesses: [...game.guesses] };
  writeJson(storage, GAME_KEY, stored);
}

/** Today's game as last saved, or a fresh one when the saved game is for another puzzle number. */
export function loadSavedGame(storage: KeyValueStorage, graph: GraphVersion, puzzle: Puzzle): Game {
  const stored = readJson(storage, GAME_KEY) as Partial<StoredGame> | undefined;
  if (stored?.puzzleNumber !== puzzle.number || !Array.isArray(stored.guesses)) {
    return newGame(puzzle);
  }
  const guesses: KommunCode[] = [];
  for (const code of stored.guesses as unknown[]) {
    if (
      typeof code === "string" &&
      graph.kommuner.has(code) &&
      code !== puzzle.start &&
      code !== puzzle.destination &&
      !guesses.includes(code)
    ) {
      guesses.push(code);
    }
  }
  return { puzzle, guesses };
}
