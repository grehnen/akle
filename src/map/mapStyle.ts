import type {
  GeoJSONSourceSpecification,
  LayerSpecification,
  MapOptions,
  StyleSpecification,
} from "maplibre-gl";
import type { Bounds, DrawnFeatures } from "./mapFeatures";

/**
 * The satellite background: EOX Sentinel-2 cloudless 2016 (CC BY 4.0), loaded live from EOX.
 * Change this one value to switch to self-hosted tiles.
 */
export const SATELLITE_TILE_URL =
  "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg";

const EOX_ATTRIBUTION =
  '<a href="https://cloudless.eox.at">EOxCloudless</a> by <a href="https://eox.at">EOX IT Services GmbH</a> (Contains modified Copernicus Sentinel data 2016 &amp; 2017)';

const OSM_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Keeps players near Sweden. */
const SWEDEN_SURROUNDINGS: Bounds = [4, 53, 32, 71];

export function satelliteMapStyle(drawn: DrawnFeatures): StyleSpecification {
  const layers: LayerSpecification[] = [
    { id: "satellite", type: "raster", source: "satellite" },
    {
      id: "kommun-fill",
      type: "fill",
      source: "kommuner",
      paint: { "fill-color": ["get", "color"], "fill-opacity": 0.25 },
    },
    {
      id: "kommun-outline-solid",
      type: "line",
      source: "kommuner",
      filter: ["==", ["get", "connected"], true],
      paint: { "line-color": ["get", "color"], "line-width": 1, "line-opacity": 1 },
    },
    {
      id: "kommun-outline-dashed",
      type: "line",
      source: "kommuner",
      filter: ["==", ["get", "connected"], false],
      paint: {
        "line-color": ["get", "color"],
        "line-width": 1,
        "line-opacity": 1,
        "line-dasharray": [3, 2],
      },
    },
  ];
  return {
    version: 8,
    sources: {
      satellite: {
        type: "raster",
        tiles: [SATELLITE_TILE_URL],
        tileSize: 256,
        maxzoom: 14,
        attribution: EOX_ATTRIBUTION,
      },
      kommuner: {
        type: "geojson",
        data: drawn as GeoJSONSourceSpecification["data"],
        attribution: OSM_ATTRIBUTION,
      },
    },
    layers,
  };
}

/** Pan and zoom only: no rotation or tilt, by mouse, keyboard or touch. */
export function mapOptions(bounds: Bounds | undefined): Omit<MapOptions, "container" | "style"> {
  return {
    bounds: bounds ?? [10.9, 55.3, 24.2, 69.1],
    fitBoundsOptions: { padding: 40 },
    maxBounds: SWEDEN_SURROUNDINGS,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    rollEnabled: false,
    maxPitch: 0,
    attributionControl: { compact: true },
  };
}
