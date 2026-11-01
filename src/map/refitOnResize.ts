import type { Map as MapLibreMap } from "maplibre-gl";
import type { Bounds } from "./mapFeatures";
import { fitPadding, mapOptions } from "./mapStyle";

/** What a fit puts on its move events: the bounds it frames. */
export const FITTED_BOUNDS = "fittedBounds";

type MoveEvent = { originalEvent?: unknown; [FITTED_BOUNDS]?: Bounds };

type RefittingMap = Pick<MapLibreMap, "fitBounds" | "getContainer"> & {
  on(type: "movestart" | "resize", listener: (event: MoveEvent) => void): unknown;
};

/**
 * Keeps the map framing what it last fitted when its size changes, as when the on-screen keyboard
 * opens, because a resize alone keeps the centre and zoom and can leave the endpoints cut off.
 * Once the player pans or zooms, resizes leave the view alone until the next fit.
 */
export function refitOnResize(map: RefittingMap, opening: Bounds | undefined): void {
  let framed = opening;
  let movedByPlayer = false;

  map.on("movestart", (event) => {
    if (event[FITTED_BOUNDS]) {
      framed = event[FITTED_BOUNDS];
      movedByPlayer = false;
    } else if (event.originalEvent) {
      movedByPlayer = true;
    }
  });
  map.on("resize", () => {
    if (movedByPlayer) return;
    const { clientWidth: width, clientHeight: height } = map.getContainer();
    map.fitBounds(mapOptions(framed).bounds, {
      padding: fitPadding({ width, height }),
      animate: false,
    });
  });
}
