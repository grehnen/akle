import Flatbush from "flatbush";
import type { KommunCode } from "../../src/graph/graphVersion";
import { pointOnLand, segmentIntersection, type LandWaterMask } from "./landBorders";
import type { Line, Position, SharedBorder } from "./sharedBorders";

/** An OSM way that may carry a fixed link: a road, path or railway. */
export type LinkWay = {
  id: number;
  tags: Readonly<Record<string, string | number | undefined>>;
  line: Line;
};

/**
 * Why a way doesn't make its fixed link qualify: a tag that makes it not public, an end that
 * doesn't reach meaningful land (the mainland or an island of at least 1 km²), or land reached
 * only off the main part of the kommun on that side, as on an exclave.
 */
export type LinkFailure =
  | "access=private"
  | "access=no"
  | "service=driveway"
  | "highway=track"
  | "no-land-end"
  | "exclave-end";

export const linkFailures: readonly LinkFailure[] = [
  "access=private",
  "access=no",
  "service=driveway",
  "highway=track",
  "no-land-end",
  "exclave-end",
];

export type WayFailure = { way: number; reasons: LinkFailure[] };

export type FixedLink = {
  between: readonly [KommunCode, KommunCode];
  /**
   * The OSM ids of the ways that cross the border, over land or water, ascending: only the passing
   * ways when the link qualifies, every way when it doesn't.
   */
  ways: number[];
  /** The crossing ways that fail, ascending, with why; see {@link qualifies}. */
  failures: WayFailure[];
};

/** A link qualifies, and makes its pair neighbors, when at least one of its ways passes. */
export function qualifies(link: Pick<FixedLink, "ways" | "failures">): boolean {
  return link.failures.length < link.ways.length;
}

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
 * The pairs of kommuner joined by a road, path or railway: a usable way that crosses their shared
 * border, over land or water. Each link lists the crossing ways that fail: a way that isn't
 * public, or one that doesn't reach meaningful land on both sides, in the main part of the kommun
 * on each side. An end follows the `network` of ways joined to it without crossing a border.
 */
export function findFixedLinks(
  borders: readonly SharedBorder[],
  ways: readonly LinkWay[],
  mask: LandWaterMask,
  network: readonly LinkWay[] = ways,
  inMainPart: (code: KommunCode, point: Position) => boolean = () => true,
): FixedLink[] {
  const segments = borderSegments(borders);
  if (segments.length === 0) return [];
  const index = segmentIndex(segments);
  const isOnLand = pointOnLand(mask);

  const usable = ways.filter(isUsable);
  const crossingsByPair = new Map<number, Crossing[]>();
  for (const way of usable) {
    for (let step = 0; step + 1 < way.line.length; step++) {
      const [from, to] = [way.line[step], way.line[step + 1]];
      for (const id of index.search(...segmentBounds(from, to))) {
        const segment = segments[id];
        if (segmentIntersection(from, to, segment.from, segment.to) === undefined) continue;
        const crossings = crossingsByPair.get(segment.pair) ?? [];
        crossings.push({ way, step });
        crossingsByPair.set(segment.pair, crossings);
      }
    }
  }
  const walked = new Set([...usable, ...network.filter(isUsable)]);
  const reachedLand = landReach(
    [...walked.values()],
    [...crossingsByPair.values()].flat(),
    isOnLand,
  );

  return [...crossingsByPair]
    .sort(([a], [b]) => a - b)
    .flatMap(([pair, crossings]): FixedLink[] => {
      const [a, b] = borders[pair].between;
      // A crossing passes when its ends reach land in the main parts of the two kommuner, one on
      // each side. Ends that reach the same kommun's main part only touch the border.
      const outcome = ({ way, step }: Crossing): "pass" | "touch" | LinkFailure => {
        const from = reachedLand(way.line[step]);
        const to = reachedLand(way.line[step + 1]);
        if (from === undefined || to === undefined) return "no-land-end";
        const [fromA, fromB, toA, toB] = [
          inMainPart(a, from),
          inMainPart(b, from),
          inMainPart(a, to),
          inMainPart(b, to),
        ];
        if ((fromA && toB) || (fromB && toA)) return "pass";
        if ((fromA && toA) || (fromB && toB)) return "touch";
        return "exclave-end";
      };
      const byWay = new Map<number, { way: LinkWay; outcomes: ReturnType<typeof outcome>[] }>();
      for (const crossing of crossings) {
        const entry = byWay.get(crossing.way.id) ?? { way: crossing.way, outcomes: [] };
        entry.outcomes.push(outcome(crossing));
        byWay.set(crossing.way.id, entry);
      }
      const crossingWays = [...byWay.values()]
        .filter(({ outcomes }) => outcomes.some((result) => result !== "touch"))
        .sort((x, y) => x.way.id - y.way.id);
      if (crossingWays.length === 0) return [];
      const failures = crossingWays.flatMap(({ way, outcomes }): WayFailure[] => {
        const reasons = notPublicReasons(way);
        if (!outcomes.includes("pass")) {
          reasons.push(outcomes.includes("exclave-end") ? "exclave-end" : "no-land-end");
        }
        return reasons.length > 0 ? [{ way: way.id, reasons }] : [];
      });
      const failing = new Set(failures.map(({ way }) => way));
      const passing = crossingWays.filter(({ way }) => !failing.has(way.id));
      // A link that qualifies lists only its passing ways; most failing ways are tracks.
      return passing.length > 0
        ? [{ between: borders[pair].between, ways: passing.map(({ way }) => way.id), failures: [] }]
        : [
            {
              between: borders[pair].between,
              ways: crossingWays.map(({ way }) => way.id),
              failures,
            },
          ];
    });
}

/** Whether a way crosses any of the borders, to pick the candidates out of every road. */
export function crossesABorder(borders: readonly SharedBorder[]): (way: LinkWay) => boolean {
  const segments = borderSegments(borders);
  if (segments.length === 0) return () => false;
  const index = segmentIndex(segments);
  return ({ line }) => {
    if (line.length < 2) return false;
    const xs = line.map((point) => point[0]);
    const ys = line.map((point) => point[1]);
    if (
      index.search(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)).length === 0
    ) {
      return false;
    }
    for (let step = 0; step + 1 < line.length; step++) {
      const [from, to] = [line[step], line[step + 1]];
      for (const id of index.search(...segmentBounds(from, to))) {
        const segment = segments[id];
        if (segmentIntersection(from, to, segment.from, segment.to) !== undefined) return true;
      }
    }
    return false;
  };
}

function borderSegments(borders: readonly SharedBorder[]): BorderSegment[] {
  return borders.flatMap((border, pair) =>
    border.lines.flatMap((line) =>
      line.slice(1).map((to, index) => ({ pair, from: line[index], to })),
    ),
  );
}

function segmentIndex(segments: readonly BorderSegment[]): Flatbush {
  const index = new Flatbush(segments.length);
  for (const { from, to } of segments) index.add(...segmentBounds(from, to));
  index.finish();
  return index;
}

/**
 * The first point on meaningful land a way's vertex reaches along the ways joined to it, without
 * taking a step that crosses a border, so it stays in the kommun it starts in.
 */
function landReach(
  ways: readonly LinkWay[],
  crossings: readonly Crossing[],
  isOnLand: (point: Position) => boolean,
): (start: Position) => Position | undefined {
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
  const answers = new Map<string, Position | undefined>();
  return (start) => {
    if (answers.has(key(start))) return answers.get(key(start));
    const queue = [start];
    const seen = new Set([key(start)]);
    let found: Position | undefined;
    for (let index = 0; index < queue.length && !found; index++) {
      if (isOnLand(queue[index])) {
        found = queue[index];
        break;
      }
      for (const next of steps.get(key(queue[index])) ?? []) {
        if (!seen.has(key(next))) {
          seen.add(key(next));
          queue.push(next);
        }
      }
    }
    if (!found) for (const visited of seen) answers.set(visited, undefined);
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
