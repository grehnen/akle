import type { IControl, Map as MapLibreMap } from "maplibre-gl";
import type { Bounds } from "./mapFeatures";
import { fitPadding, mapOptions } from "./mapStyle";

type ResettableMap = Pick<
  MapLibreMap,
  | "cameraForBounds"
  | "fitBounds"
  | "getCanvas"
  | "getCenter"
  | "getContainer"
  | "getZoom"
  | "project"
> & {
  on(type: "movestart" | "moveend" | "resize", listener: () => void): void;
  off(type: "movestart" | "moveend" | "resize", listener: () => void): void;
};

/** How a fitted view frames its bounds at the map's current size. */
export function fitOptions(map: Pick<MapLibreMap, "getContainer">) {
  const { clientWidth: width, clientHeight: height } = map.getContainer();
  return { padding: fitPadding({ width, height }) };
}

/** Eases the map to frame `bounds`, the way the reset button does. */
export function animateToBounds(
  map: Pick<MapLibreMap, "fitBounds" | "getContainer">,
  bounds: Bounds | undefined,
): void {
  map.fitBounds(mapOptions(bounds).bounds, { ...fitOptions(map), duration: 500, linear: true });
}

/**
 * Restores the default framing at the map's current size, without changing game progress.
 * `setBounds` moves that framing as the game goes on, without moving the map.
 */
export function zoomResetControl(bounds: Bounds | undefined) {
  let options = mapOptions(bounds);
  let cleanup: (() => void) | undefined;
  let refresh: (() => void) | undefined;

  return {
    onAdd(map: ResettableMap): HTMLElement {
      const container = document.createElement("div");
      container.className = "maplibregl-ctrl maplibregl-ctrl-group satellite-map__zoom-reset";
      const button = document.createElement("button");
      button.type = "button";
      button.title = "Återställ kartvyn";
      button.setAttribute("aria-label", button.title);
      button.innerHTML =
        '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10a8 8 0 1 0 0 6M20 4v6h-6"/></svg>';
      container.append(button);

      const reset = () => animateToBounds(map, options.bounds);
      const updateVisibility = () => {
        const camera = map.cameraForBounds(options.bounds, fitOptions(map));
        const distance = camera?.center
          ? map.project(camera.center).dist(map.project(map.getCenter()))
          : Infinity;
        container.hidden =
          distance < 1 &&
          camera?.zoom !== undefined &&
          Math.abs(map.getZoom() - camera.zoom) < 0.01;
        if (container.hidden && container.contains(document.activeElement)) {
          map.getCanvas().focus({ preventScroll: true });
        }
      };
      const show = () => {
        container.hidden = false;
      };

      button.addEventListener("click", reset);
      map.on("movestart", show);
      map.on("moveend", updateVisibility);
      map.on("resize", updateVisibility);
      updateVisibility();
      refresh = updateVisibility;
      cleanup = () => {
        button.removeEventListener("click", reset);
        map.off("movestart", show);
        map.off("moveend", updateVisibility);
        map.off("resize", updateVisibility);
        container.remove();
      };
      return container;
    },
    onRemove() {
      cleanup?.();
      cleanup = undefined;
      refresh = undefined;
    },
    setBounds(next: Bounds | undefined) {
      options = mapOptions(next);
      refresh?.();
    },
  } satisfies IControl & { setBounds(next: Bounds | undefined): void };
}
