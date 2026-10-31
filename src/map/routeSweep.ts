import type {
  ExpressionSpecification,
  GeoJSONSourceSpecification,
  Map as MapLibreMap,
} from "maplibre-gl";
import type { GraphVersion, KommunCode } from "../graph/graphVersion";
import { splitExclaves } from "./exclaves";
import { TOOLTIP_LAYER } from "./mapStyle";

export type RouteSweep = {
  /** The kommuner to light, in the order they light up. */
  stops: readonly KommunCode[];
  /** A Perfect win's sweep is gold, and the stops flash together once it lands. */
  perfect: boolean;
  /** How long the board stays up, which the sweep has to fit inside. */
  holdMs: number;
  /** Shows the stops lit at once, with no movement, for players who ask for reduced motion. */
  still: boolean;
};

const SOURCE = "route-sweep";
const FILL_LAYER = "route-sweep-fill";
const LINE_LAYER = "route-sweep-line";
const WIN_COLOR = "#86efac";
const PERFECT_COLOR = "#fecc02";

/** The share of the hold the sweep may take; a Perfect win keeps more for its flash. */
const WIN_SWEEP_SHARE = 0.7;
const PERFECT_SWEEP_SHARE = 0.5;
const LONGEST_STEP_MS = 240;
const FLASH_RISE_MS = 180;
const FLASH_SETTLE_MS = 400;
/** How lit a stop stays once its flash has settled, so the stops read as one line. */
const SETTLED_LIT = 0.55;
/** Each of the Perfect flash's beats is this long, and it runs for two full waves. */
const PERFECT_BEAT_MS = 260;

/** How lit a stop is, 0 to 1, this long after the sweep began. */
function litAt(index: number, elapsedMs: number, stepMs: number, { stops, perfect }: RouteSweep) {
  const sinceReached = elapsedMs - index * stepMs;
  if (sinceReached < 0) return 0;
  const landedAgo = elapsedMs - stepMs * stops.length;
  if (perfect && landedAgo > 0 && landedAgo < 2 * Math.PI * PERFECT_BEAT_MS) {
    return SETTLED_LIT + (1 - SETTLED_LIT) * Math.abs(Math.cos(landedAgo / PERFECT_BEAT_MS));
  }
  if (sinceReached < FLASH_RISE_MS) return sinceReached / FLASH_RISE_MS;
  const settling = Math.min(1, (sinceReached - FLASH_RISE_MS) / FLASH_SETTLE_MS);
  return 1 - settling * (1 - SETTLED_LIT);
}

/**
 * Lights a route's stops on the map one by one, in its own layers over everything but the
 * tooltips; however many stops there are, the sweep fits the hold. Returns how to stop and remove it.
 */
export function playRouteSweep(
  map: MapLibreMap,
  graph: GraphVersion,
  sweep: RouteSweep,
): () => void {
  const { stops, perfect, holdMs, still } = sweep;
  if (stops.length === 0) return () => {};

  const onRoute = new Set(stops);
  const features = graph.shapes.features
    .filter((feature) => onRoute.has(feature.properties.code))
    .flatMap(({ properties, geometry }) => {
      const { main, exclaves } = splitExclaves(geometry, graph.exclaveParts.get(properties.code));
      return [
        { type: "Feature", properties, geometry: main },
        ...(exclaves === undefined
          ? []
          : [
              { type: "Feature", properties: { ...properties, exclave: true }, geometry: exclaves },
            ]),
      ];
    });
  const lit: ExpressionSpecification = ["coalesce", ["feature-state", "lit"], 0];
  map.addSource(SOURCE, {
    type: "geojson",
    promoteId: "code",
    data: { type: "FeatureCollection", features } as GeoJSONSourceSpecification["data"],
  });
  map.addLayer(
    {
      id: FILL_LAYER,
      type: "fill",
      source: SOURCE,
      paint: {
        "fill-color": perfect ? PERFECT_COLOR : WIN_COLOR,
        "fill-opacity": ["*", 0.8, lit],
      },
    },
    TOOLTIP_LAYER,
  );
  // As everywhere on the map, an outline only ever traces a kommun's main part.
  map.addLayer(
    {
      id: LINE_LAYER,
      type: "line",
      source: SOURCE,
      filter: ["!=", ["get", "exclave"], true],
      paint: {
        "line-color": "#ffffff",
        "line-opacity": lit,
        "line-width": ["+", 1, ["*", 2.5, lit]],
      },
    },
    TOOLTIP_LAYER,
  );

  const light = (code: KommunCode, value: number) =>
    map.setFeatureState({ source: SOURCE, id: code }, { lit: value });
  const remove = () => {
    // The map may already have gone with the board, taking its layers along.
    if (!map.getStyle()) return;
    map.removeLayer(LINE_LAYER);
    map.removeLayer(FILL_LAYER);
    map.removeSource(SOURCE);
  };

  if (still) {
    for (const code of stops) light(code, SETTLED_LIT);
    return remove;
  }

  const sweepMs = holdMs * (perfect ? PERFECT_SWEEP_SHARE : WIN_SWEEP_SHARE);
  const stepMs = Math.min(LONGEST_STEP_MS, sweepMs / stops.length);
  const startedAt = performance.now();
  let frame = requestAnimationFrame(function draw(now) {
    stops.forEach((code, index) => light(code, litAt(index, now - startedAt, stepMs, sweep)));
    frame = requestAnimationFrame(draw);
  });
  return () => {
    cancelAnimationFrame(frame);
    remove();
  };
}
