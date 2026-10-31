import { useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent, Popup } from "maplibre-gl";
import type { GuessCard, Trip } from "../engine/game";
import { type GraphVersion, type KommunCode, kommunName } from "../graph/graphVersion";
import {
  defaultBounds,
  type DrawnKommun,
  guessViewBounds,
  hintViewBounds,
  mapFeatures,
  routeBounds,
  routeFeatures,
} from "./mapFeatures";
import { mapDescription } from "./mapDescription";
import { MapLibreLoaderContext } from "./mapLibreLoader";
import { type MapReadiness, mapReadiness } from "./mapReadiness";
import { mapOptions, satelliteMapStyle, TOOLTIP_LAYER, TOUCH_SCREEN_QUERY } from "./mapStyle";
import { playRouteSweep, type RouteSweep } from "./routeSweep";
import { tooltipText } from "./tooltip";
import { animateToBounds, zoomResetControl } from "./zoomResetControl";

type SatelliteMapProps = {
  graph: GraphVersion;
  trip: Pick<Trip, "start" | "destination">;
  cards: readonly Pick<GuessCard, "code" | "feedback" | "connected">[];
  /**
   * Draws this route instead, with the guessed and missed kommuner on it marked. The label names
   * the map, and the map is fitted to the kommuner in `frame`. Without a route, the map is fitted
   * to `defaultBounds`, each new guess eases it to `guessViewBounds`, and each new hint outline
   * to `hintViewBounds`.
   */
  route?: { kommuner: readonly KommunCode[]; label: string; frame: readonly KommunCode[] };
  /** Kommuner revealed by hints, drawn as unfilled outlines. */
  hintOutlines?: readonly KommunCode[];
  /** Hint 3: hint-outline tooltips show initials instead of `?`. */
  initials?: boolean;
  /** Once the game is finished: outlines every other kommun too, each with its name as tooltip. */
  allOutlines?: boolean;
  /**
   * Told once when the map is drawn, its satellite and endpoints in view, or when it never can
   * be (`mapReadiness`). Until then its frame shows a skeleton.
   */
  onReady?: () => void;
  /**
   * The map loads unseen, behind a trip's `Starta`: it names no kommun, in its label or its
   * description, until it is shown.
   */
  concealed?: boolean;
  /** Plays while set, once the map has loaded; a map that never does simply doesn't play it. */
  sweep?: RouteSweep;
};

/**
 * Satellite map of the endpoints, guesses and hint outlines, and of every other kommun's outline
 * once the game is finished. Hovering or tapping a drawn kommun
 * shows its tooltip. Display only: clicking or tapping it never guesses. Its frame shows a
 * skeleton until the map is drawn.
 */
export function SatelliteMap({
  graph,
  trip,
  cards,
  route,
  hintOutlines,
  initials = false,
  allOutlines = false,
  onReady,
  concealed = false,
  sweep,
}: SatelliteMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap>();
  const loadMapLibre = useContext(MapLibreLoaderContext);
  const [ready, setReady] = useState(false);
  const readiness = useRef<MapReadiness>(undefined);
  const reportReady = useRef(onReady);
  useEffect(() => {
    reportReady.current = onReady;
  }, [onReady]);
  const routeKommuner = route?.kommuner;
  const routeFrame = route?.frame;
  const drawn = useMemo(
    () =>
      routeKommuner
        ? routeFeatures(graph, trip, routeKommuner, new Set(cards.map((card) => card.code)), {
            allOutlines,
          })
        : mapFeatures(graph, trip, cards, hintOutlines, { allOutlines }),
    [graph, trip, cards, routeKommuner, hintOutlines, allOutlines],
  );
  const tooltipFor = useRef<(kommun: DrawnKommun) => string | undefined>(undefined);
  useEffect(() => {
    tooltipFor.current = (kommun) => tooltipText(graph, kommun, { initials });
  }, [graph, initials]);
  const descriptionId = useId();
  // Only a map without a route is described; a concealed one is, once shown.
  const described = route === undefined;
  const description =
    described && !concealed
      ? mapDescription(graph, trip, cards, hintOutlines, { allOutlines })
      : undefined;
  const resetBounds = useMemo(
    () => (routeFrame ? routeBounds(graph, routeFrame) : defaultBounds(graph, trip, cards)),
    [graph, trip, routeFrame, cards],
  );
  const viewBounds = useMemo(
    () => (routeFrame ? resetBounds : guessViewBounds(graph, trip, cards)),
    [graph, trip, routeFrame, cards, resetBounds],
  );
  const hintBounds = useMemo(
    () => (routeFrame ? resetBounds : hintViewBounds(graph, trip, cards, hintOutlines ?? [])),
    [graph, trip, routeFrame, cards, hintOutlines, resetBounds],
  );
  // What the map is framed for: a new guess, trip or route eases the map to `viewBounds`, and a
  // hint that adds an outline, with nothing else new, to `hintBounds`.
  const { start, destination } = trip;
  const hintCount = hintOutlines?.length ?? 0;
  const framing = useMemo(
    () => ({ start, destination, routeFrame, guessCount: cards.length, hintCount }),
    [start, destination, routeFrame, cards.length, hintCount],
  );
  const latest = useRef({ framing, resetBounds, viewBounds });
  useEffect(() => {
    latest.current = { framing, resetBounds, viewBounds };
  }, [framing, resetBounds, viewBounds]);
  const fittedFor = useRef(framing);
  const resetControl = useRef<ReturnType<typeof zoomResetControl>>(undefined);

  useEffect(() => {
    let cancelled = false;
    let created: MapLibreMap | undefined;
    const touchScreen = window.matchMedia(TOUCH_SCREEN_QUERY);
    const followTouchScreen = () => {
      if (touchScreen.matches) created?.cooperativeGestures.enable();
      else created?.cooperativeGestures.disable();
    };
    touchScreen.addEventListener("change", followTouchScreen);
    const watching = mapReadiness(() => {
      setReady(true);
      reportReady.current?.();
    });
    readiness.current = watching;
    const opening = latest.current;
    fittedFor.current = opening.framing;
    const opened = loadMapLibre().then((maplibre) => {
      if (cancelled || !container.current) return;
      if (maplibre === undefined) {
        watching.unavailable();
        return;
      }
      try {
        created = new maplibre.Map({
          container: container.current,
          style: satelliteMapStyle({ type: "FeatureCollection", features: [] }),
          ...mapOptions(opening.viewBounds, {
            touchScreen: touchScreen.matches,
            size: {
              width: container.current.clientWidth,
              height: container.current.clientHeight,
            },
          }),
        });
      } catch {
        // Without WebGL MapLibre can't draw; the map stays empty and the game still plays.
        watching.unavailable();
        return;
      }
      if (described) created.getCanvas().setAttribute("aria-describedby", descriptionId);
      created.touchZoomRotate.disableRotation();
      created.keyboard.disableRotation();
      created.addControl(
        new maplibre.NavigationControl({ showCompass: false, visualizePitch: false }),
        "top-right",
      );
      resetControl.current = zoomResetControl(opening.resetBounds);
      created.addControl(resetControl.current, "top-right");
      showTooltips(
        created,
        new maplibre.Popup({
          closeButton: false,
          closeOnClick: false,
          className: "kommun-tooltip",
          offset: 10,
        }),
        (kommun) => tooltipFor.current?.(kommun),
      );
      const loaded = created;
      // MapLibre expands the compact attribution as soon as the map gets credits; fold it to
      // its ⓘ button in that same event so it never flashes open over the endpoints.
      const foldAttribution = () => {
        const attribution = loaded.getContainer().querySelector(".maplibregl-ctrl-attrib");
        if (!attribution?.classList.contains("maplibregl-compact")) return;
        attribution.classList.remove("maplibregl-compact-show");
        loaded.off("styledata", foldAttribution);
        loaded.off("sourcedata", foldAttribution);
      };
      loaded.on("styledata", foldAttribution);
      loaded.on("sourcedata", foldAttribution);
      loaded.once("load", () => setMap(loaded));
    });
    // Without MapLibre, as when its chunk can't be fetched, the game still plays.
    opened.catch(() => {
      if (!cancelled) watching.unavailable();
    });
    return () => {
      cancelled = true;
      watching.stop();
      readiness.current = undefined;
      touchScreen.removeEventListener("change", followTouchScreen);
      created?.remove();
      resetControl.current = undefined;
      setMap(undefined);
    };
  }, [described, descriptionId, loadMapLibre]);

  useEffect(() => {
    if (map) resetControl.current?.setBounds(resetBounds);
  }, [map, resetBounds]);

  useEffect(() => {
    const last = fittedFor.current;
    if (!map || framing === last) return;
    fittedFor.current = framing;
    const hintedOnly =
      framing.start === last.start &&
      framing.destination === last.destination &&
      framing.routeFrame === last.routeFrame &&
      framing.guessCount === last.guessCount;
    if (!hintedOnly) animateToBounds(map, viewBounds);
    else if (framing.hintCount > last.hintCount) animateToBounds(map, hintBounds);
  }, [map, framing, viewBounds, hintBounds]);

  useEffect(() => {
    const source = map?.getSource<GeoJSONSource>("kommuner");
    if (!map || !source) return;
    source.setData(drawn as Parameters<GeoJSONSource["setData"]>[0]);
    readiness.current?.shapesIn(map);
  }, [map, drawn]);

  useEffect(() => {
    if (map && sweep) return playRouteSweep(map, graph, sweep);
  }, [map, graph, sweep]);

  return (
    <div
      className="satellite-map"
      role="region"
      aria-label={
        concealed
          ? "Karta"
          : route
            ? `${route.label} från ${kommunName(graph, trip.start)} till ${kommunName(graph, trip.destination)}`
            : `Karta över ${kommunName(graph, trip.start)} och ${kommunName(graph, trip.destination)}`
      }
      aria-busy={ready ? undefined : true}
    >
      {/* MapLibre owns this element's children, so the description and skeleton sit beside it. */}
      <div ref={container} className="satellite-map__canvas" />
      {!ready && <div className="map-skeleton" aria-hidden="true" />}
      {description && (
        <p id={descriptionId} className="visually-hidden">
          {description}
        </p>
      )}
    </div>
  );
}

/**
 * Shows a drawn kommun's tooltip while the mouse is over it, or after a tap on touch screens;
 * a tap anywhere else hides it.
 */
function showTooltips(
  map: MapLibreMap,
  popup: Popup,
  textFor: (kommun: DrawnKommun) => string | undefined,
): void {
  const show = (event: MapMouseEvent) => {
    const [feature] = map.queryRenderedFeatures(event.point, { layers: [TOOLTIP_LAYER] });
    const text = feature && textFor(feature.properties as DrawnKommun);
    if (text === undefined) {
      popup.remove();
      return;
    }
    popup.setLngLat(event.lngLat).setText(text);
    if (!popup.isOpen()) popup.addTo(map);
  };
  map.on("mousemove", show);
  map.on("click", show);
  map.on("mouseout", () => popup.remove());
}
