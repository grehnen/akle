import { connectedTo, type Feedback, type GuessCard, type Trip } from "../engine/game";
import { routeStops } from "../engine/routeStops";
import type { GraphVersion, KommunCode } from "../graph/graphVersion";

export const START_COLOR = "#fecc02";
export const DESTINATION_COLOR = "#006aa7";
/** The endpoints' outlines match their road signs: red around the start, white around the destination. */
export const START_EDGE_COLOR = "#ed1c24";
export const DESTINATION_EDGE_COLOR = "#ffffff";
export const CONNECTED_COLOR = "#4ade80";
export const UNCONNECTED_COLOR = "#9ca3af";
export const MISSED_COLOR = "#f87171";
export const HINT_COLOR = "#ffffff";
export const OTHER_COLOR = "#ffffff";

export type DrawnKommun = {
  code: KommunCode;
  /**
   * "missed" marks a kommun on the result view's route that the player didn't guess; "hint" is
   * an unfilled outline revealed by a hint; "other" is an unfilled outline of any other kommun,
   * drawn once the game is finished.
   */
  kind: "start" | "destination" | "guess" | "missed" | "hint" | "other";
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

type FeatureOptions = {
  /** Once the game is finished: outlines every other kommun too, underneath the rest. */
  allOutlines?: boolean;
};

/**
 * What the map draws: any hint outlines underneath, then the endpoints, then the guesses in
 * order. Nothing else, until the game is finished: then every other kommun is outlined instead
 * of the hint outlines.
 */
export function mapFeatures(
  graph: GraphVersion,
  trip: Pick<Trip, "start" | "destination">,
  cards: readonly Pick<GuessCard, "code" | "connected">[],
  hintOutlines: readonly KommunCode[] = [],
  { allOutlines = false }: FeatureOptions = {},
): DrawnFeatures {
  const shown = new Set([trip.start, trip.destination, ...cards.map((card) => card.code)]);
  const drawn: DrawnKommun[] = [
    ...(allOutlines ? [] : hintOutlines)
      .filter((code) => !shown.has(code))
      .map((code) => ({ code, kind: "hint" as const, color: HINT_COLOR, connected: true })),
    { code: trip.start, kind: "start", color: START_COLOR, connected: true },
    { code: trip.destination, kind: "destination", color: DESTINATION_COLOR, connected: true },
    ...cards.map((card) => ({
      code: card.code,
      kind: "guess" as const,
      color: card.connected ? CONNECTED_COLOR : UNCONNECTED_COLOR,
      connected: card.connected,
    })),
  ];
  return withShapes(graph, allOutlines ? withOtherOutlines(graph, drawn) : drawn);
}

/**
 * The result view's map: guesses off the route underneath, drawn like unconnected guesses, then the endpoints, then the
 * route's kommuner, guessed or missed, over the outlines of every other kommun when
 * `allOutlines` is set.
 */
export function routeFeatures(
  graph: GraphVersion,
  trip: Pick<Trip, "start" | "destination">,
  route: readonly KommunCode[],
  guesses: ReadonlySet<KommunCode>,
  { allOutlines = false }: FeatureOptions = {},
): DrawnFeatures {
  const onRoute = new Set(route);
  const drawn: DrawnKommun[] = [
    ...[...guesses]
      .filter((code) => !onRoute.has(code))
      .map((code) => ({
        code,
        kind: "guess" as const,
        color: UNCONNECTED_COLOR,
        connected: false,
      })),
    { code: trip.start, kind: "start", color: START_COLOR, connected: true },
    { code: trip.destination, kind: "destination", color: DESTINATION_COLOR, connected: true },
    ...routeStops(trip, route, guesses).flatMap(({ code, kind }): DrawnKommun[] => {
      if (kind === "guessed")
        return [{ code, kind: "guess", color: CONNECTED_COLOR, connected: true }];
      if (kind === "missed")
        return [{ code, kind: "missed", color: MISSED_COLOR, connected: false }];
      return [];
    }),
  ];
  return withShapes(graph, allOutlines ? withOtherOutlines(graph, drawn) : drawn);
}

/** Puts an outline of every kommun not already drawn underneath the drawn ones. */
function withOtherOutlines(graph: GraphVersion, drawn: readonly DrawnKommun[]): DrawnKommun[] {
  const shown = new Set(drawn.map((kommun) => kommun.code));
  return [
    ...graph.shapes.features
      .map((feature) => feature.properties.code)
      .filter((code) => !shown.has(code))
      .map((code) => ({ code, kind: "other" as const, color: OTHER_COLOR, connected: true })),
    ...drawn,
  ];
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

type FramedCard = Pick<GuessCard, "code" | "feedback" | "connected">;

const FRAMED_FEEDBACK: ReadonlySet<Feedback> = new Set(["✅", "🟩", "🟧"]);

/**
 * The box the reset button returns to: the endpoints, every ✅/🟩/🟧 guess, and every guess
 * linked to the start or the destination through guesses.
 */
export function defaultBounds(
  graph: GraphVersion,
  trip: Pick<Trip, "start" | "destination">,
  cards: readonly FramedCard[],
): Bounds | undefined {
  return routeBounds(graph, [trip.start, trip.destination, ...framedGuesses(graph, trip, cards)]);
}

/**
 * The box the map is fitted to after a guess: the default bounds, plus the latest guess even when
 * it doesn't belong to them.
 */
export function guessViewBounds(
  graph: GraphVersion,
  trip: Pick<Trip, "start" | "destination">,
  cards: readonly FramedCard[],
): Bounds | undefined {
  const latest = cards.at(-1)?.code;
  return routeBounds(graph, [
    trip.start,
    trip.destination,
    ...framedGuesses(graph, trip, cards),
    ...(latest === undefined ? [] : [latest]),
  ]);
}

function framedGuesses(
  graph: GraphVersion,
  trip: Pick<Trip, "start" | "destination">,
  cards: readonly FramedCard[],
): KommunCode[] {
  const toDestination = connectedTo(
    graph,
    trip.destination,
    cards.map((card) => card.code),
  );
  return cards
    .filter(
      (card) =>
        FRAMED_FEEDBACK.has(card.feedback) || card.connected || toDestination.has(card.code),
    )
    .map((card) => card.code);
}

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
