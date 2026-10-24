import type { Trip } from "../engine/game";
import type { GraphVersion, KommunCode } from "../graph/graphVersion";
import { shortestRouteLengthsFrom } from "../graph/routes";

/** Two kommuner a trip can run between, in either direction. */
export type TripPair = readonly [KommunCode, KommunCode];

/** Every playable pair of a graph version, by distance. */
export type TripPairs = ReadonlyMap<number, readonly TripPair[]>;

/** An inclusive range of distances to draw from. */
export type DistanceRange = { min: number; max: number };

/** A random number in [0, 1), like `Math.random`. */
export type RandomSource = () => number;

/** Every pair of kommuner with at least one kommun between them, grouped by distance. */
export function tripPairs(graph: GraphVersion): TripPairs {
  const pairs = new Map<number, TripPair[]>();
  for (const from of graph.kommuner.keys()) {
    for (const [to, distance] of shortestRouteLengthsFrom(graph, from)) {
      if (distance < 1 || to <= from) continue;
      const atDistance = pairs.get(distance) ?? [];
      atDistance.push([from, to]);
      pairs.set(distance, atDistance);
    }
  }
  return pairs;
}

/**
 * Draws a free-play trip: a distance uniformly among those in `range` with a pair, then a
 * pair uniformly at that distance, then a coin flip for which end is the start. The pair of
 * `previous` is skipped when another pair is in range. No pair in range draws nothing.
 */
export function drawTrip(
  pairs: TripPairs,
  range: DistanceRange,
  random: RandomSource,
  previous?: Trip,
): Trip | undefined {
  const inRange = (skipPrevious: boolean) =>
    [...pairs]
      .filter(([distance]) => distance >= range.min && distance <= range.max)
      .sort(([a], [b]) => a - b)
      .map(([, atDistance]) =>
        skipPrevious ? atDistance.filter((pair) => !isPairOf(pair, previous)) : atDistance,
      )
      .filter((atDistance) => atDistance.length > 0);
  const others = inRange(true);
  const candidates = others.length > 0 ? others : inRange(false);
  if (candidates.length === 0) return undefined;
  const [first, second] = pickOne(pickOne(candidates, random), random);
  return random() < 0.5
    ? { start: first, destination: second }
    : { start: second, destination: first };
}

/** The largest distance among the pairs, which is where the distance range ends. */
export function largestDistance(pairs: TripPairs): number {
  return Math.max(0, ...pairs.keys());
}

function isPairOf([first, second]: TripPair, trip: Trip | undefined): boolean {
  if (trip === undefined) return false;
  return (
    (trip.start === first && trip.destination === second) ||
    (trip.start === second && trip.destination === first)
  );
}

function pickOne<T>(items: readonly T[], random: RandomSource): T {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}
