import type { KommunCode } from "../graph/graphVersion";
import type { Puzzle } from "./game";

export type RouteStopKind = "start" | "destination" | "guessed" | "missed";

export type RouteStop = { code: KommunCode; kind: RouteStopKind };

/** Each kommun on a finished game's route, as an endpoint, a guess the player made, or one they missed. */
export function routeStops(
  puzzle: Pick<Puzzle, "start" | "destination">,
  route: readonly KommunCode[],
  guesses: ReadonlySet<KommunCode>,
): RouteStop[] {
  return route.map((code) => ({ code, kind: routeStopKind(puzzle, code, guesses) }));
}

function routeStopKind(
  puzzle: Pick<Puzzle, "start" | "destination">,
  code: KommunCode,
  guesses: ReadonlySet<KommunCode>,
): RouteStopKind {
  if (code === puzzle.start) return "start";
  if (code === puzzle.destination) return "destination";
  return guesses.has(code) ? "guessed" : "missed";
}
