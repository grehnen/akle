import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent, Popup } from "maplibre-gl";
import type { GuessCard, Puzzle } from "../engine/game";
import { type GraphVersion, type KommunCode, kommunName } from "../graph/graphVersion";
import {
  type DrawnKommun,
  endpointBounds,
  mapFeatures,
  routeBounds,
  routeFeatures,
} from "./mapFeatures";
import { mapDescription } from "./mapDescription";
import { mapOptions, satelliteMapStyle, TOOLTIP_LAYER, TOUCH_SCREEN_QUERY } from "./mapStyle";
import { tooltipText } from "./tooltip";
import { zoomResetControl } from "./zoomResetControl";

type SatelliteMapProps = {
  graph: GraphVersion;
  puzzle: Pick<Puzzle, "start" | "destination">;
  cards: readonly Pick<GuessCard, "code" | "connected">[];
  /**
   * Draws this route instead, with the guessed and missed kommuner on it marked. The label names
   * the map, and the map is fitted to the kommuner in `frame`.
   */
  route?: { kommuner: readonly KommunCode[]; label: string; frame: readonly KommunCode[] };
  /** Kommuner revealed by hints, drawn as unfilled outlines. */
  hintOutlines?: readonly KommunCode[];
  /** Hint 3: hint-outline tooltips show initials instead of `?`. */
  initials?: boolean;
  /** Once the game is finished: outlines every other kommun too, each with its name as tooltip. */
  allOutlines?: boolean;
};

/**
 * Satellite map of the endpoints, guesses and hint outlines, and of every other kommun's outline
 * once the game is finished. Hovering or tapping a drawn kommun
 * shows its tooltip. Display only: clicking or tapping it never guesses.
 */
export function SatelliteMap({
  graph,
  puzzle,
  cards,
  route,
  hintOutlines,
  initials = false,
  allOutlines = false,
}: SatelliteMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap>();
  const routeKommuner = route?.kommuner;
  const routeFrame = route?.frame;
  const drawn = useMemo(
    () =>
      routeKommuner
        ? routeFeatures(graph, puzzle, routeKommuner, new Set(cards.map((card) => card.code)), {
            allOutlines,
          })
        : mapFeatures(graph, puzzle, cards, hintOutlines, { allOutlines }),
    [graph, puzzle, cards, routeKommuner, hintOutlines, allOutlines],
  );
  const tooltipFor = useRef<(kommun: DrawnKommun) => string | undefined>(undefined);
  useEffect(() => {
    tooltipFor.current = (kommun) => tooltipText(graph, kommun, { initials });
  }, [graph, initials]);
  const descriptionId = useId();
  const description = route
    ? undefined
    : mapDescription(graph, puzzle, cards, hintOutlines, { allOutlines });
  const described = description !== undefined;
  const bounds = useMemo(
    () => (routeFrame ? routeBounds(graph, routeFrame) : endpointBounds(graph, puzzle)),
    [graph, puzzle, routeFrame],
  );

  useEffect(() => {
    let cancelled = false;
    let created: MapLibreMap | undefined;
    const touchScreen = window.matchMedia(TOUCH_SCREEN_QUERY);
    const followTouchScreen = () => {
      if (touchScreen.matches) created?.cooperativeGestures.enable();
      else created?.cooperativeGestures.disable();
    };
    touchScreen.addEventListener("change", followTouchScreen);
    // MapLibre is heavy and needs WebGL, so it loads in its own chunk on the client only.
    void Promise.all([
      import("maplibre-gl"),
      // MapLibre looks for its worker next to its own module, which the build moves and renames.
      import("maplibre-gl/dist/maplibre-gl-worker.mjs?url"),
      import("maplibre-gl/dist/maplibre-gl.css"),
    ]).then(([maplibre, { default: workerUrl }]) => {
      if (cancelled || !container.current) return;
      maplibre.setWorkerUrl(workerUrl);
      try {
        created = new maplibre.Map({
          container: container.current,
          style: satelliteMapStyle({ type: "FeatureCollection", features: [] }),
          ...mapOptions(bounds, { touchScreen: touchScreen.matches }),
        });
      } catch {
        // Without WebGL MapLibre can't draw; the map stays empty and the game still plays.
        return;
      }
      if (described) created.getCanvas().setAttribute("aria-describedby", descriptionId);
      created.touchZoomRotate.disableRotation();
      created.keyboard.disableRotation();
      created.addControl(
        new maplibre.NavigationControl({ showCompass: false, visualizePitch: false }),
        "top-right",
      );
      created.addControl(zoomResetControl(bounds), "top-right");
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
    return () => {
      cancelled = true;
      touchScreen.removeEventListener("change", followTouchScreen);
      created?.remove();
    };
  }, [bounds, described, descriptionId]);

  useEffect(() => {
    const source = map?.getSource<GeoJSONSource>("kommuner");
    source?.setData(drawn as Parameters<GeoJSONSource["setData"]>[0]);
  }, [map, drawn]);

  return (
    <div
      className="satellite-map"
      role="region"
      aria-label={
        route
          ? `${route.label} från ${kommunName(graph, puzzle.start)} till ${kommunName(graph, puzzle.destination)}`
          : `Karta över ${kommunName(graph, puzzle.start)} och ${kommunName(graph, puzzle.destination)}`
      }
    >
      {/* MapLibre owns this element's children, so the description sits beside it. */}
      <div ref={container} className="satellite-map__canvas" />
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
