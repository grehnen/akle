import Flatbush from "flatbush";
import type { KommunCode } from "../../src/graph/graphVersion";
import { interpolate, pointOnLand, segmentIntersection, type LandWaterMask } from "./landBorders";
import type { Line, Position, SharedBorder } from "./sharedBorders";

/** An OSM way that may carry a fixed link: a road, path or railway. */
export type LinkWay = {
  id: number;
  tags: Readonly<Record<string, string | number | undefined>>;
  line: Line;
};

export type FixedLink = {
  between: readonly [KommunCode, KommunCode];
  /** The OSM ids of the ways that cross the border over water, ascending. */
  ways: number[];
};

type BorderSegment = { pair: number; from: Position; to: Position };

/** `highway=*` and `railway=*` values that aren't a way anyone can travel today. */
const notTravelled = new Set([
  "proposed",
  "construction",
  "abandoned",
  "disused",
  "razed",
  "dismantled",
  "platform",
]);

/** Whether a way is a public, all-year road, path or railway (#6), not a ford or ice road. */
function isUsable({ tags }: LinkWay): boolean {
  const travelled = [tags.highway, tags.railway].filter((value) => value !== undefined);
  if (travelled.length === 0 || travelled.some((value) => notTravelled.has(String(value)))) {
    return false;
  }
  if (tags.access === "private" || tags.access === "no") return false;
  if (tags.tunnel === "building_passage") return false;
  return tags.ice_road !== "yes" && tags.winter_road !== "yes" && tags.ford !== "yes";
}

/**
 * The pairs of kommuner joined by a bridge, tunnel or causeway: a usable way that crosses their
 * shared border where the border runs through water (the sea or a lake).
 */
export function findFixedLinks(
  borders: readonly SharedBorder[],
  ways: readonly LinkWay[],
  mask: LandWaterMask,
): FixedLink[] {
  const segments: BorderSegment[] = borders.flatMap((border, pair) =>
    border.lines.flatMap((line) =>
      line.slice(1).map((to, index) => ({ pair, from: line[index], to })),
    ),
  );
  if (segments.length === 0) return [];
  const index = new Flatbush(segments.length);
  for (const { from, to } of segments) index.add(...segmentBounds(from, to));
  index.finish();
  const isOnLand = pointOnLand(mask);

  const waysByPair = new Map<number, Set<number>>();
  for (const way of ways) {
    if (!isUsable(way)) continue;
    for (let step = 0; step + 1 < way.line.length; step++) {
      const [from, to] = [way.line[step], way.line[step + 1]];
      for (const id of index.search(...segmentBounds(from, to))) {
        const segment = segments[id];
        const t = segmentIntersection(from, to, segment.from, segment.to);
        if (t === undefined || isOnLand(interpolate(from, to, t))) continue;
        const pairWays = waysByPair.get(segment.pair) ?? new Set();
        pairWays.add(way.id);
        waysByPair.set(segment.pair, pairWays);
      }
    }
  }
  return [...waysByPair]
    .sort(([a], [b]) => a - b)
    .map(([pair, pairWays]) => ({
      between: borders[pair].between,
      ways: [...pairWays].sort((a, b) => a - b),
    }));
}

function segmentBounds(from: Position, to: Position): [number, number, number, number] {
  return [
    Math.min(from[0], to[0]),
    Math.min(from[1], to[1]),
    Math.max(from[0], to[0]),
    Math.max(from[1], to[1]),
  ];
}
