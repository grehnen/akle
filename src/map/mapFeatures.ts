import type { GuessCard, Puzzle } from "../engine/game";
import type { GraphVersion, KommunCode } from "../graph/graphVersion";

export const START_COLOR = "#fecc02";
export const DESTINATION_COLOR = "#006aa7";
export const CONNECTED_COLOR = "#4ade80";
export const UNCONNECTED_COLOR = "#9ca3af";
export const MISSED_COLOR = "#f87171";
export const HINT_COLOR = "#ffffff";

export type DrawnKommun = {
  code: KommunCode;
  /**
   * "missed" marks a kommun on the result view's route that the player didn't guess; "hint" is
   * an unfilled outline revealed by a hint.
   */
  kind: "start" | "destination" | "guess" | "missed" | "hint";
  color: string;
  /** Unconnected guesses get a dashed outline; endpoints are always drawn solid. */
  connected: boolean;
};

export type DrawnFeature = {
  type: "Feature";
  properties: DrawnKommun;
  geometry: unknown;
};

export type DrawnFeatures = {
  type: "FeatureCollection";
  features: DrawnFeature[];
};

/** [west, south, east, north] in degrees. */
export type Bounds = [number, number, number, number];

/**
 * What the map draws: any hint outlines underneath, then the endpoints, then the guesses in
 * order. Nothing else.
 */
export function mapFeatures(
  graph: GraphVersion,
  puzzle: Pick<Puzzle, "start" | "destination">,
  cards: readonly Pick<GuessCard, "code" | "connected">[],
  hintOutlines: readonly KommunCode[] = [],
): DrawnFeatures {
  const shown = new Set([puzzle.start, puzzle.destination, ...cards.map((card) => card.code)]);
  const drawn: DrawnKommun[] = [
    ...hintOutlines
      .filter((code) => !shown.has(code))
      .map((code) => ({ code, kind: "hint" as const, color: HINT_COLOR, connected: true })),
    { code: puzzle.start, kind: "start", color: START_COLOR, connected: true },
    { code: puzzle.destination, kind: "destination", color: DESTINATION_COLOR, connected: true },
    ...cards.map((card) => ({
      code: card.code,
      kind: "guess" as const,
      color: card.connected ? CONNECTED_COLOR : UNCONNECTED_COLOR,
      connected: card.connected,
    })),
  ];
  return withShapes(graph, drawn);
}

/** The result view's map: the endpoints, then the route's kommuner, guessed or missed. */
export function routeFeatures(
  graph: GraphVersion,
  puzzle: Pick<Puzzle, "start" | "destination">,
  route: readonly KommunCode[],
  guesses: ReadonlySet<KommunCode>,
): DrawnFeatures {
  const drawn: DrawnKommun[] = [
    { code: puzzle.start, kind: "start", color: START_COLOR, connected: true },
    { code: puzzle.destination, kind: "destination", color: DESTINATION_COLOR, connected: true },
    ...route
      .filter((code) => code !== puzzle.start && code !== puzzle.destination)
      .map((code) =>
        guesses.has(code)
          ? { code, kind: "guess" as const, color: CONNECTED_COLOR, connected: true }
          : { code, kind: "missed" as const, color: MISSED_COLOR, connected: false },
      ),
  ];
  return withShapes(graph, drawn);
}

function withShapes(graph: GraphVersion, drawn: readonly DrawnKommun[]): DrawnFeatures {
  const shapes = shapesByCode(graph);
  const features: DrawnFeature[] = [];
  for (const kommun of drawn) {
    const geometry = shapes.get(kommun.code);
    if (geometry !== undefined) features.push({ type: "Feature", properties: kommun, geometry });
  }
  return { type: "FeatureCollection", features };
}

/** The box around the start and destination shapes, which the map starts fitted to. */
export function endpointBounds(
  graph: GraphVersion,
  puzzle: Pick<Puzzle, "start" | "destination">,
): Bounds | undefined {
  return routeBounds(graph, [puzzle.start, puzzle.destination]);
}

/** The box around the shapes of every kommun on a route. */
export function routeBounds(graph: GraphVersion, route: readonly KommunCode[]): Bounds | undefined {
  const shapes = shapesByCode(graph);
  const bounds: Bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const code of route) {
    const geometry = shapes.get(code) as { coordinates?: unknown } | undefined;
    extend(bounds, geometry?.coordinates);
  }
  return bounds[0] <= bounds[2] ? bounds : undefined;
}

function shapesByCode(graph: GraphVersion): Map<KommunCode, unknown> {
  return new Map(
    graph.shapes.features.map((feature) => [feature.properties.code, feature.geometry]),
  );
}

function extend(bounds: Bounds, coordinates: unknown): void {
  if (!Array.isArray(coordinates)) return;
  const [x, y] = coordinates;
  if (typeof x === "number" && typeof y === "number") {
    bounds[0] = Math.min(bounds[0], x);
    bounds[1] = Math.min(bounds[1], y);
    bounds[2] = Math.max(bounds[2], x);
    bounds[3] = Math.max(bounds[3], y);
    return;
  }
  for (const nested of coordinates) extend(bounds, nested);
}
