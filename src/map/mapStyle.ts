import type {
  ExpressionSpecification,
  GeoJSONSourceSpecification,
  LayerSpecification,
  MapOptions,
  StyleSpecification,
} from "maplibre-gl";
import {
  type Bounds,
  DESTINATION_EDGE_COLOR,
  type DrawnFeatures,
  START_EDGE_COLOR,
} from "./mapFeatures";

/**
 * The satellite background: EOxCloudless 2016, made from 2016 & 2017 Sentinel-2 data (CC BY 4.0), loaded live from EOX.
 * Change this one value to switch to self-hosted tiles.
 */
export const SATELLITE_TILE_URL =
  "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg";

const EOX_ATTRIBUTION =
  '<a href="https://cloudless.eox.at">EOxCloudless</a> by <a href="https://eox.at">EOX IT Services GmbH</a> (Contains modified Copernicus Sentinel data 2016 &amp; 2017), <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>';

const OSM_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** The layer whose features show a tooltip on hover or tap. */
export const TOOLTIP_LAYER = "kommun-tooltip-target";

/** Hint and other outlines are drawn unfilled, in their own line layers. */
const FILLED: ExpressionSpecification = [
  "!",
  ["in", ["get", "kind"], ["literal", ["hint", "other"]]],
];

/**
 * Keeps players near Sweden, while leaving room to zoom out until the whole length of Sweden fits,
 * with the fit padding, in a 4:3 map.
 */
const SWEDEN_SURROUNDINGS: Bounds = [-5, 54, 40, 70];

/** Fitted views keep this share of the map's smaller side clear around what they frame. */
const FIT_PADDING_SHARE = 0.05;

export type MapSize = { width: number; height: number };

/** The padding around a fitted view, in pixels, scaled to the map so small maps lose little. */
export function fitPadding({ width, height }: MapSize): number {
  return Math.round(Math.min(width, height) * FIT_PADDING_SHARE);
}

const ENDPOINT: ExpressionSpecification = [
  "in",
  ["get", "kind"],
  ["literal", ["start", "destination"]],
];

/** Exclaves are filled but not outlined, so an outline only ever traces a kommun's main part. */
const NOT_EXCLAVE: ExpressionSpecification = ["!=", ["get", "exclave"], true];

/** The endpoints get their own outline layer, above every other outline. */
const NOT_UNFILLED_OR_ENDPOINT: ExpressionSpecification = [
  "!",
  ["in", ["get", "kind"], ["literal", ["hint", "other", "start", "destination"]]],
];

export function satelliteMapStyle(drawn: DrawnFeatures): StyleSpecification {
  const layers: LayerSpecification[] = [
    { id: "satellite", type: "raster", source: "satellite" },
    {
      id: "kommun-fill",
      type: "fill",
      source: "kommuner",
      filter: FILLED,
      paint: {
        "fill-color": ["get", "color"],
        "fill-opacity": ["match", ["get", "kind"], ["start", "destination"], 0.4, 0.25],
      },
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
      filter: ["all", NOT_UNFILLED_OR_ENDPOINT, ["==", ["get", "connected"], true], NOT_EXCLAVE],
      paint: { "line-color": ["get", "color"], "line-width": 1, "line-opacity": 1 },
    },
    {
      id: "kommun-outline-dashed",
      type: "line",
      source: "kommuner",
      filter: ["all", ["==", ["get", "connected"], false], NOT_EXCLAVE],
      paint: {
        "line-color": ["get", "color"],
        "line-width": 1,
        "line-opacity": 1,
        "line-dasharray": [3, 2],
      },
    },
    // Last of the outlines, so no neighbouring guess's edge hides the endpoints' sign-coloured, heavier edges.
    {
      id: "endpoint-outline",
      type: "line",
      source: "kommuner",
      filter: ["all", ENDPOINT, NOT_EXCLAVE],
      paint: {
        "line-color": [
          "match",
          ["get", "kind"],
          "start",
          START_EDGE_COLOR,
          "destination",
          DESTINATION_EDGE_COLOR,
          ["get", "color"],
        ],
        "line-width": 2,
        "line-opacity": 1,
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
  {
    touchScreen = false,
    size = { width: 0, height: 0 },
  }: { touchScreen?: boolean; size?: MapSize } = {},
) {
  return {
    bounds: bounds ?? [10.9, 55.3, 24.2, 69.1],
    fitBoundsOptions: { padding: fitPadding(size) },
    maxBounds: SWEDEN_SURROUNDINGS,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    rollEnabled: false,
    maxPitch: 0,
    attributionControl: { compact: true },
    cooperativeGestures: touchScreen,
    locale: MAP_LOCALE,
  } satisfies Omit<MapOptions, "container" | "style">;
}
