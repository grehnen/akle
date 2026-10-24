import type { KommunCode } from "../graph/graphVersion";
import type { Trip } from "./game";

export type RouteStopKind = "start" | "destination" | "guessed" | "missed";

export type RouteStop = { code: KommunCode; kind: RouteStopKind };

/** Each kommun on a finished game's route, as an endpoint, a guess the player made, or one they missed. */
export function routeStops(
  trip: Pick<Trip, "start" | "destination">,
  route: readonly KommunCode[],
  guesses: ReadonlySet<KommunCode>,
): RouteStop[] {
  return route.map((code) => ({ code, kind: routeStopKind(trip, code, guesses) }));
}

function routeStopKind(
  trip: Pick<Trip, "start" | "destination">,
  code: KommunCode,
  guesses: ReadonlySet<KommunCode>,
): RouteStopKind {
  if (code === trip.start) return "start";
  if (code === trip.destination) return "destination";
  return guesses.has(code) ? "guessed" : "missed";
}
