import { createContext } from "react";
import type * as MapLibre from "maplibre-gl";

/**
 * Loads MapLibre for a map, or gives none when it can't be loaded. Tests stand in for it, since
 * MapLibre doesn't run without WebGL, and so decide when a map is ready.
 */
export type LoadMapLibre = () => Promise<typeof MapLibre | undefined>;

/** MapLibre is heavy and needs WebGL, so it loads in its own chunk on the client only. */
export const loadMapLibre: LoadMapLibre = () =>
  Promise.all([
    import("maplibre-gl"),
    // MapLibre looks for its worker next to its own module, which the build moves and renames.
    import("maplibre-gl/dist/maplibre-gl-worker.mjs?url"),
    import("maplibre-gl/dist/maplibre-gl.css"),
  ]).then(([maplibre, { default: workerUrl }]) => {
    maplibre.setWorkerUrl(workerUrl);
    return maplibre;
  });

export const MapLibreLoaderContext = createContext<LoadMapLibre>(loadMapLibre);
