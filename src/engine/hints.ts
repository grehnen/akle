import type { GraphVersion, KommunCode } from "../graph/graphVersion";
import { preferredShortestRoute } from "../graph/routes";
import { type Game, reviewGame } from "./game";

export const HINT_COUNT = 3;

/** What the taken hints show on the map. */
export type HintReveals = {
  /** Kommuner drawn as hint outlines: hint 1's kommun, then every kommun from hint 2. */
  outlines: KommunCode[];
  /** Hint 3: hint-outline tooltips show initials instead of `?`. */
  initials: boolean;
};

/** Takes the next hint; free, but only while the game is unfinished and hints remain. */
export function takeHint(graph: GraphVersion, game: Game): Game {
  const taken = game.hints?.taken ?? 0;
  if (taken >= HINT_COUNT || reviewGame(graph, game).status !== "playing") return game;
  if (game.hints !== undefined) return { ...game, hints: { ...game.hints, taken: taken + 1 } };
  const nextKommun = nextKommunHint(graph, game);
  return nextKommun === undefined ? game : { ...game, hints: { taken: 1, nextKommun } };
}

/**
 * Hint 1: the first unguessed kommun along the shortest route with the most guesses (ties by
 * kommun code, as in the result view). Walking from the start, that kommun borders the start's
 * connected group.
 */
export function nextKommunHint(graph: GraphVersion, game: Game): KommunCode | undefined {
  const { start, destination } = game.puzzle;
  const guessed = new Set(game.guesses);
  const route = preferredShortestRoute(graph, start, destination, guessed);
  return route?.find((code) => code !== start && code !== destination && !guessed.has(code));
}

export function hintReveals(graph: GraphVersion, game: Game): HintReveals {
  if (game.hints === undefined) return { outlines: [], initials: false };
  const { taken, nextKommun } = game.hints;
  const everyOther =
    taken >= 2 ? [...graph.kommuner.keys()].filter((code) => code !== nextKommun) : [];
  return { outlines: [nextKommun, ...everyOther], initials: taken >= 3 };
}

/** The initial of each word of a kommun name, split at spaces and hyphens: `U… B…`. */
export function kommunInitials(name: string): string {
  return name
    .split(/[\s-]+/)
    .filter((word) => word !== "")
    .map((word) => `${word[0]}…`)
    .join(" ");
}
