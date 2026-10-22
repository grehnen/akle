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

/**
 * Why a way doesn't make its fixed link qualify: a tag that makes it not public, or an end that
 * doesn't reach meaningful land (the mainland or an island of at least 1 km²).
 */
export type LinkFailure =
  | "access=private"
  | "access=no"
  | "service=driveway"
  | "highway=track"
  | "no-land-end";

export const linkFailures: readonly LinkFailure[] = [
  "access=private",
  "access=no",
  "service=driveway",
  "highway=track",
  "no-land-end",
];

export type WayFailure = { way: number; reasons: LinkFailure[] };

export type FixedLink = {
  between: readonly [KommunCode, KommunCode];
  /** The OSM ids of the ways that cross the border over water, ascending. */
  ways: number[];
  /**
   * The crossing ways that keep the link from qualifying, ascending. A link qualifies, and makes
   * the pair neighbors, only when this is empty.
   */
  failures: WayFailure[];
};

type BorderSegment = { pair: number; from: Position; to: Position };
type Crossing = { way: LinkWay; step: number };

/** `highway=*` and `railway=*` values that aren't a way anyone can travel today. */
const notTravelled = new Set([
  "proposed",
  "construction",
  "abandoned",
  "disused",
  "razed",
  "dismantled",
  "platform",
  "ferry",
]);

/** Whether a way is an all-year road, path or railway (#6), not a ford or ice road. */
function isUsable({ tags }: LinkWay): boolean {
  const travelled = [tags.highway, tags.railway].filter((value) => value !== undefined);
  if (travelled.length === 0 || travelled.some((value) => notTravelled.has(String(value)))) {
    return false;
  }
  if (tags.tunnel === "building_passage") return false;
  return tags.ice_road !== "yes" && tags.winter_road !== "yes" && tags.ford !== "yes";
}

/** The tags that make a way not public. */
function notPublicReasons({ tags }: LinkWay): LinkFailure[] {
  const reasons: LinkFailure[] = [];
  if (tags.access === "private") reasons.push("access=private");
  if (tags.access === "no") reasons.push("access=no");
  if (tags.highway === "service" && tags.service === "driveway") reasons.push("service=driveway");
  if (tags.highway === "track") reasons.push("highway=track");
  return reasons;
}

/**
 * The pairs of kommuner joined by a bridge, tunnel or causeway: a usable way that crosses their
 * shared border where the border runs through water (the sea or a lake) or over an island under
 * 1 km², which doesn't count as land. Each link lists the crossing ways that keep it from
 * qualifying: a way that isn't public, or one with an end that doesn't reach meaningful land,
 * following the `network` of ways joined to it without crossing a border over water again.
 */
export function findFixedLinks(
  borders: readonly SharedBorder[],
  ways: readonly LinkWay[],
  mask: LandWaterMask,
  network: readonly LinkWay[] = ways,
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

  const usable = ways.filter(isUsable);
  const crossingsByPair = new Map<number, Crossing[]>();
  for (const way of usable) {
    for (let step = 0; step + 1 < way.line.length; step++) {
      const [from, to] = [way.line[step], way.line[step + 1]];
      for (const id of index.search(...segmentBounds(from, to))) {
        const segment = segments[id];
        const t = segmentIntersection(from, to, segment.from, segment.to);
        if (t === undefined || isOnLand(interpolate(from, to, t))) continue;
        const crossings = crossingsByPair.get(segment.pair) ?? [];
        crossings.push({ way, step });
        crossingsByPair.set(segment.pair, crossings);
      }
    }
  }
  const walked = new Set([...usable, ...network.filter(isUsable)]);
  const reachesLand = landReach(
    [...walked.values()],
    [...crossingsByPair.values()].flat(),
    isOnLand,
  );

  return [...crossingsByPair]
    .sort(([a], [b]) => a - b)
    .map(([pair, crossings]) => {
      const byWay = new Map<number, Crossing[]>();
      for (const crossing of crossings) {
        byWay.set(crossing.way.id, [...(byWay.get(crossing.way.id) ?? []), crossing]);
      }
      const wayIds = [...byWay.keys()].sort((a, b) => a - b);
      const failures = wayIds.flatMap((id): WayFailure[] => {
        const wayCrossings = byWay.get(id) ?? [];
        const reasons = notPublicReasons(wayCrossings[0].way);
        const landAtBothEnds = wayCrossings.every(
          ({ way, step }) => reachesLand(way.line[step]) && reachesLand(way.line[step + 1]),
        );
        if (!landAtBothEnds) reasons.push("no-land-end");
        return reasons.length > 0 ? [{ way: id, reasons }] : [];
      });
      return { between: borders[pair].between, ways: wayIds, failures };
    });
}

/**
 * Whether a way's vertex reaches meaningful land along the ways joined to it, without taking a
 * step that crosses a border over water.
 */
function landReach(
  ways: readonly LinkWay[],
  crossings: readonly Crossing[],
  isOnLand: (point: Position) => boolean,
): (start: Position) => boolean {
  const key = (point: Position) => `${point[0]},${point[1]}`;
  const blocked = new Set(crossings.map(({ way, step }) => `${way.id}:${step}`));
  const steps = new Map<string, Position[]>();
  const join = (from: Position, to: Position) => {
    const next = steps.get(key(from));
    if (next) next.push(to);
    else steps.set(key(from), [to]);
  };
  for (const way of ways) {
    for (let step = 0; step + 1 < way.line.length; step++) {
      if (blocked.has(`${way.id}:${step}`)) continue;
      join(way.line[step], way.line[step + 1]);
      join(way.line[step + 1], way.line[step]);
    }
  }
  const answers = new Map<string, boolean>();
  return (start) => {
    const known = answers.get(key(start));
    if (known !== undefined) return known;
    const queue = [start];
    const seen = new Set([key(start)]);
    let found = false;
    for (let index = 0; index < queue.length && !found; index++) {
      if (isOnLand(queue[index])) found = true;
      for (const next of steps.get(key(queue[index])) ?? []) {
        if (!seen.has(key(next))) {
          seen.add(key(next));
          queue.push(next);
        }
      }
    }
    if (!found) for (const visited of seen) answers.set(visited, false);
    answers.set(key(start), found);
    return found;
  };
}

function segmentBounds(from: Position, to: Position): [number, number, number, number] {
  return [
    Math.min(from[0], to[0]),
    Math.min(from[1], to[1]),
    Math.max(from[0], to[0]),
    Math.max(from[1], to[1]),
  ];
}
