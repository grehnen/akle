import type { KommunCode } from "../graph/graphVersion";

/** What the map was last framed for. */
export type MapFraming = {
  start: KommunCode;
  destination: KommunCode;
  routeFrame: readonly KommunCode[] | undefined;
  guessCount: number;
  /** How many kommuner the hints outline. */
  hintCount: number;
};

/**
 * Where a change eases the map: a new guess, trip or route to the guess view, and hint 1's
 * outline, with nothing else new, to the hint view. Hint 2 outlines every kommun, so it leaves
 * the map where it is rather than zooming out to all of Sweden.
 */
export function refitFor(last: MapFraming, next: MapFraming): "guess" | "hint" | undefined {
  const hintedOnly =
    next.start === last.start &&
    next.destination === last.destination &&
    next.routeFrame === last.routeFrame &&
    next.guessCount === last.guessCount;
  if (!hintedOnly) return "guess";
  if (last.hintCount === 0 && next.hintCount > 0) return "hint";
  return undefined;
}
