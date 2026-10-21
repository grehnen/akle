import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { GuessCard, Puzzle } from "../engine/game";
import { type GraphVersion, type KommunCode, kommunName } from "../graph/graphVersion";
import { endpointBounds, mapFeatures, routeBounds, routeFeatures } from "./mapFeatures";
import { mapOptions, satelliteMapStyle, TOUCH_SCREEN_QUERY } from "./mapStyle";

type SatelliteMapProps = {
  graph: GraphVersion;
  puzzle: Pick<Puzzle, "start" | "destination">;
  cards: readonly Pick<GuessCard, "code" | "connected">[];
  /** Draws this route instead, with the guessed and missed kommuner on it marked. */
  route?: readonly KommunCode[];
};

/** Satellite map of the endpoints and guesses. Display only: clicking it never guesses. */
export function SatelliteMap({ graph, puzzle, cards, route }: SatelliteMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap>();
  const drawn = useMemo(
    () =>
      route
        ? routeFeatures(graph, puzzle, route, new Set(cards.map((card) => card.code)))
        : mapFeatures(graph, puzzle, cards),
    [graph, puzzle, cards, route],
  );
  const bounds = useMemo(
    () => (route ? routeBounds(graph, route) : endpointBounds(graph, puzzle)),
    [graph, puzzle, route],
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
    void Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl.css")]).then(
      ([maplibre]) => {
        if (cancelled || !container.current) return;
        created = new maplibre.Map({
          container: container.current,
          style: satelliteMapStyle({ type: "FeatureCollection", features: [] }),
          ...mapOptions(bounds, { touchScreen: touchScreen.matches }),
        });
        created.touchZoomRotate.disableRotation();
        created.keyboard.disableRotation();
        created.addControl(
          new maplibre.NavigationControl({ showCompass: false, visualizePitch: false }),
          "top-right",
        );
        const loaded = created;
        loaded.once("load", () => {
          // Start with the attribution folded to its ⓘ button so it doesn't cover the endpoints.
          loaded
            .getContainer()
            .querySelector(".maplibregl-ctrl-attrib")
            ?.classList.remove("maplibregl-compact-show");
          setMap(loaded);
        });
      },
    );
    return () => {
      cancelled = true;
      touchScreen.removeEventListener("change", followTouchScreen);
      created?.remove();
    };
  }, [bounds]);

  useEffect(() => {
    const source = map?.getSource<GeoJSONSource>("kommuner");
    source?.setData(drawn as Parameters<GeoJSONSource["setData"]>[0]);
  }, [map, drawn]);

  return (
    <div
      ref={container}
      className="satellite-map"
      role="region"
      aria-label={
        route
          ? `Kortaste vägen från ${kommunName(graph, puzzle.start)} till ${kommunName(graph, puzzle.destination)}`
          : `Karta över ${kommunName(graph, puzzle.start)} och ${kommunName(graph, puzzle.destination)}`
      }
    />
  );
}
