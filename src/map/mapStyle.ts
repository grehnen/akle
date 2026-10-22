import type {
  ExpressionSpecification,
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

/** The layer whose features show a tooltip on hover or tap. */
export const TOOLTIP_LAYER = "kommun-tooltip-target";

/** Hint and other outlines are drawn unfilled, in their own line layers. */
const FILLED: ExpressionSpecification = [
  "!",
  ["in", ["get", "kind"], ["literal", ["hint", "other"]]],
];

/** Keeps players near Sweden. */
const SWEDEN_SURROUNDINGS: Bounds = [4, 53, 32, 71];

export function satelliteMapStyle(drawn: DrawnFeatures): StyleSpecification {
  const layers: LayerSpecification[] = [
    { id: "satellite", type: "raster", source: "satellite" },
    {
      id: "kommun-fill",
      type: "fill",
      source: "kommuner",
      filter: FILLED,
      paint: { "fill-color": ["get", "color"], "fill-opacity": 0.25 },
    },
    // Once the game is finished, every other kommun is outlined too: unfilled and fainter still.
    {
      id: "other-outline",
      type: "line",
      source: "kommuner",
      filter: ["==", ["get", "kind"], "other"],
      paint: { "line-color": "#ffffff", "line-width": 1, "line-opacity": 0.35 },
    },
    // While playing, hint outlines are the one exception to "other outlines are never shown": unfilled and faint.
    {
      id: "hint-outline",
      type: "line",
      source: "kommuner",
      filter: ["==", ["get", "kind"], "hint"],
      paint: { "line-color": "#ffffff", "line-width": 1, "line-opacity": 0.5 },
    },
    {
      id: "kommun-outline-solid",
      type: "line",
      source: "kommuner",
      filter: ["all", FILLED, ["==", ["get", "connected"], true]],
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
    // Invisible, but MapLibre still finds its features under the pointer.
    { id: TOOLTIP_LAYER, type: "fill", source: "kommuner", paint: { "fill-opacity": 0 } },
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

/** Screens whose main pointer is a finger. Matches MapLibre's switch to its mobile help text. */
export const TOUCH_SCREEN_QUERY = "(hover: none), (pointer: coarse)";

/** MapLibre's on-map texts, in Swedish. */
const MAP_LOCALE = {
  "Map.Title": "Karta. Piltangenterna flyttar kartan, plus och minus zoomar.",
  "NavigationControl.ZoomIn": "Zooma in",
  "NavigationControl.ZoomOut": "Zooma ut",
  "AttributionControl.ToggleAttribution": "Visa eller dölj källor",
  "CooperativeGesturesHandler.MobileHelpText": "Använd två fingrar för att flytta kartan",
  "CooperativeGesturesHandler.WindowsHelpText": "Håll Ctrl och scrolla för att zooma kartan",
  "CooperativeGesturesHandler.MacHelpText": "Håll ⌘ och scrolla för att zooma kartan",
};

/**
 * Pan and zoom only: no rotation or tilt, by mouse, keyboard or touch. On touch screens the map
 * needs two fingers, so one finger scrolls the page past it.
 */
export function mapOptions(
  bounds: Bounds | undefined,
  { touchScreen = false }: { touchScreen?: boolean } = {},
): Omit<MapOptions, "container" | "style"> {
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
    cooperativeGestures: touchScreen,
    locale: MAP_LOCALE,
  };
}
