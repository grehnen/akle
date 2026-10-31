// PROTOTYPE (#137): throwaway. Never merge to main.
// The effects themselves, played by TripBoard while a trip finished just now holds its board.
import { createContext, useEffect, useRef } from "react";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { GameReview, Trip } from "../engine/game";
import type { GraphVersion, KommunCode } from "../graph/graphVersion";
import { TOOLTIP_LAYER } from "../map/mapStyle";
import "./TripEffectPrototype.css";

export type EffectVariant = "a" | "b" | "c" | "nu";

/** Undefined outside the prototype, so the board stays as it is today. */
export const EffectVariantContext = createContext<EffectVariant | undefined>(undefined);

type Outcome = "perfect" | "win" | "loss";

type TripEffectProps = {
  variant: EffectVariant;
  graph: GraphVersion;
  trip: Pick<Trip, "start" | "destination">;
  review: GameReview;
  map: MapLibreMap | undefined;
  holdMs: number;
};

export function TripEffect({ variant, graph, trip, review, map, holdMs }: TripEffectProps) {
  const outcome: Outcome = review.perfect ? "perfect" : review.status === "won" ? "win" : "loss";
  if (variant === "nu") return null;
  return (
    <>
      {outcome === "loss" && <div className="trip-effect-dim" aria-hidden="true" />}
      {variant === "a" && (
        <RouteSweep
          graph={graph}
          trip={trip}
          review={review}
          map={map}
          outcome={outcome}
          holdMs={holdMs}
        />
      )}
      {variant === "b" && outcome !== "loss" && <Confetti outcome={outcome} holdMs={holdMs} />}
      {variant === "c" && (
        <div className={`trip-effect-glow trip-effect-glow--${outcome}`} aria-hidden="true" />
      )}
    </>
  );
}

const EFFECT_SOURCE = "trip-effect";
const EFFECT_FILL = "trip-effect-fill";
const EFFECT_LINE = "trip-effect-line";

const SWEEP_COLORS: Record<Outcome, string> = {
  perfect: "#fecc02",
  win: "#86efac",
  loss: "#d1d5db",
};

/**
 * Variant A: lights Min rutt stop by stop from start to destination, however long the route, in the
 * time the hold leaves. A loss walks only as far as the guesses reach and stops at the first miss.
 * Perfect is gold, and the whole route flashes twice once the sweep lands.
 */
function RouteSweep({
  graph,
  trip,
  review,
  map,
  outcome,
  holdMs,
}: Omit<TripEffectProps, "variant"> & { outcome: Outcome }) {
  useEffect(() => {
    if (!map) return;
    const route = review.cheapestRoute ?? [trip.start, trip.destination];
    const missing = new Set(review.missing);
    const firstMiss = route.findIndex((code) => missing.has(code));
    const walked = firstMiss === -1 ? route : route.slice(0, firstMiss + 1);
    const onRoute = new Set(walked);
    const features = graph.shapes.features.filter((feature) =>
      onRoute.has(feature.properties.code),
    );

    map.addSource(EFFECT_SOURCE, {
      type: "geojson",
      promoteId: "code",
      data: { type: "FeatureCollection", features } as never,
    });
    map.addLayer(
      {
        id: EFFECT_FILL,
        type: "fill",
        source: EFFECT_SOURCE,
        paint: {
          "fill-color": SWEEP_COLORS[outcome],
          "fill-opacity": ["*", 0.8, ["coalesce", ["feature-state", "lit"], 0]],
        },
      },
      TOOLTIP_LAYER,
    );
    map.addLayer(
      {
        id: EFFECT_LINE,
        type: "line",
        source: EFFECT_SOURCE,
        paint: {
          "line-color": "#ffffff",
          "line-opacity": ["coalesce", ["feature-state", "lit"], 0],
          "line-width": ["+", 1, ["*", 2.5, ["coalesce", ["feature-state", "lit"], 0]]],
        },
      },
      TOOLTIP_LAYER,
    );

    const sweepWindow = holdMs * (outcome === "perfect" ? 0.5 : 0.7);
    const stepMs = Math.min(240, sweepWindow / Math.max(1, walked.length));
    const landedAt = stepMs * walked.length;
    const litAt = (index: number, elapsed: number, code: KommunCode): number => {
      const since = elapsed - index * stepMs;
      if (since < 0) return 0;
      // A quick flash that settles, so the lit stops read as one line behind the moving front.
      const flash = since < 180 ? since / 180 : 1 - Math.min(1, (since - 180) / 400) * 0.45;
      if (outcome === "loss") return flash * (missing.has(code) ? 0.35 : 0.6);
      if (outcome === "perfect" && elapsed > landedAt) {
        const wave = (elapsed - landedAt) / 260;
        return wave < 2 * Math.PI ? 0.55 + 0.45 * Math.abs(Math.cos(wave)) : flash;
      }
      return flash;
    };

    const startedAt = performance.now();
    let frame = requestAnimationFrame(function draw(now) {
      const elapsed = now - startedAt;
      walked.forEach((code, index) => {
        map.setFeatureState(
          { source: EFFECT_SOURCE, id: code },
          { lit: litAt(index, elapsed, code) },
        );
      });
      frame = requestAnimationFrame(draw);
    });

    return () => {
      cancelAnimationFrame(frame);
      try {
        map.removeLayer(EFFECT_LINE);
        map.removeLayer(EFFECT_FILL);
        if (map.getSource<GeoJSONSource>(EFFECT_SOURCE)) map.removeSource(EFFECT_SOURCE);
      } catch {
        // The map went with the board.
      }
    };
  }, [map, graph, trip, review, outcome, holdMs]);
  return null;
}

/** Variant B: hand-built particles in the flag's colours; Perfect fires from both lower corners. */
function Confetti({ outcome, holdMs }: { outcome: Outcome; holdMs: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;
    const width = (element.width = window.innerWidth);
    const height = (element.height = window.innerHeight);
    const frameBox = element.parentElement?.getBoundingClientRect();
    const colors =
      outcome === "perfect"
        ? ["#fecc02", "#fecc02", "#ffe680", "#ffffff"]
        : ["#fecc02", "#006aa7", "#4ade80", "#ffffff"];
    const particle = (x: number, y: number, angle: number, speed: number) => ({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 5 + Math.random() * 6,
      spin: Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)] as string,
    });
    const spread = (center: number, by: number) => center + (Math.random() - 0.5) * by;
    const particles =
      outcome === "perfect"
        ? Array.from({ length: 240 }, (_, index) =>
            index % 2 === 0
              ? particle(0, height, spread(-Math.PI / 3, 0.9), 500 + Math.random() * 900)
              : particle(width, height, spread((-2 * Math.PI) / 3, 0.9), 500 + Math.random() * 900),
          )
        : Array.from({ length: 90 }, () =>
            particle(
              (frameBox?.left ?? 0) + (frameBox?.width ?? width) / 2,
              (frameBox?.top ?? 0) + (frameBox?.height ?? height) / 2,
              Math.random() * 2 * Math.PI,
              150 + Math.random() * 550,
            ),
          );

    const startedAt = performance.now();
    let last = startedAt;
    let frame = requestAnimationFrame(function draw(now) {
      const step = (now - last) / 1000;
      last = now;
      const life = (now - startedAt) / holdMs;
      context.clearRect(0, 0, width, height);
      context.globalAlpha = Math.max(0, Math.min(1, (1 - life) * 3));
      for (const piece of particles) {
        piece.vy += 900 * step;
        piece.vx *= 1 - 1.2 * step;
        piece.x += piece.vx * step;
        piece.y += piece.vy * step;
        piece.spin += 8 * step;
        context.fillStyle = piece.color;
        context.save();
        context.translate(piece.x, piece.y);
        context.rotate(piece.spin);
        context.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2);
        context.restore();
      }
      frame = requestAnimationFrame(draw);
    });
    return () => cancelAnimationFrame(frame);
  }, [outcome, holdMs]);
  return <canvas ref={canvas} className="trip-effect-confetti" aria-hidden="true" />;
}
