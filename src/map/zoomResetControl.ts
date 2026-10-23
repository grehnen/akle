import type { IControl, Map as MapLibreMap } from "maplibre-gl";
import type { Bounds } from "./mapFeatures";
import { mapOptions } from "./mapStyle";

type ResettableMap = Pick<
  MapLibreMap,
  "cameraForBounds" | "fitBounds" | "getCanvas" | "getCenter" | "getZoom" | "project"
> & {
  on(type: "movestart" | "moveend" | "resize", listener: () => void): void;
  off(type: "movestart" | "moveend" | "resize", listener: () => void): void;
};

/** Restores the opening framing at the map's current size, without changing game progress. */
export function zoomResetControl(bounds: Bounds | undefined) {
  const options = mapOptions(bounds);
  let cleanup: (() => void) | undefined;

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

      const reset = () => {
        map.fitBounds(options.bounds, {
          ...options.fitBoundsOptions,
          duration: 500,
          linear: true,
        });
      };
      const updateVisibility = () => {
        const camera = map.cameraForBounds(options.bounds, options.fitBoundsOptions);
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
    },
  } satisfies IControl;
}
