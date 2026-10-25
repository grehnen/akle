import { describe, expect, test } from "bun:test";
import {
  fitPadding,
  mapOptions,
  SATELLITE_TILE_URL,
  satelliteMapStyle,
  TOOLTIP_LAYER,
} from "./mapStyle";
import { DESTINATION_EDGE_COLOR, START_EDGE_COLOR } from "./mapFeatures";

const empty = { type: "FeatureCollection" as const, features: [] };

describe("satelliteMapStyle", () => {
  const style = satelliteMapStyle(empty);

  test("loads the satellite background from the one configured tile URL, undarkened", () => {
    expect(SATELLITE_TILE_URL).toBe(
      "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg",
    );
    expect(style.sources.satellite).toMatchObject({ type: "raster", tiles: [SATELLITE_TILE_URL] });
    const raster = style.layers.find((layer) => layer.type === "raster");
    expect(raster?.paint).toBeUndefined();
  });

  test("credits EOX and OpenStreetMap with links", () => {
    const attribution = Object.values(style.sources)
      .map((source) => ("attribution" in source ? source.attribution : ""))
      .join(" ");
    expect(attribution).toContain('href="https://cloudless.eox.at"');
    expect(attribution).toContain("EOX IT Services GmbH");
    expect(attribution).toContain("Copernicus Sentinel data 2016");
    expect(attribution).toContain(
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    );
  });

  test("fills drawn kommuner at 0.25 opacity, start and destination at 0.4, with a 1 px opaque outline in the same hue", () => {
    const fill = style.layers.find((layer) => layer.type === "fill");
    expect(fill?.paint).toEqual({
      "fill-color": ["get", "color"],
      "fill-opacity": ["match", ["get", "kind"], ["start", "destination"], 0.4, 0.25],
    });
    const dashed = style.layers.find((layer) => layer.id === "kommun-outline-dashed");
    expect(dashed?.paint).toMatchObject({
      "line-color": ["get", "color"],
      "line-width": 1,
      "line-opacity": 1,
    });
  });

  test("edges start in red and destination in white, 2 px, like their road signs", () => {
    const endpoints = style.layers.find((layer) => layer.id === "endpoint-outline");
    expect(endpoints).toMatchObject({
      type: "line",
      filter: ["in", ["get", "kind"], ["literal", ["start", "destination"]]],
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
    });
  });

  test("draws the endpoints' edges above every other outline", () => {
    const lineIds = style.layers.filter((layer) => layer.type === "line").map((layer) => layer.id);
    expect(lineIds.at(-1)).toBe("endpoint-outline");
  });

  test("outlines connected kommuner solid and unconnected guesses dashed", () => {
    const lines = style.layers.filter(
      (layer) =>
        layer.type === "line" &&
        !["hint-outline", "other-outline", "endpoint-outline"].includes(layer.id),
    );
    const solid = lines.find((layer) => !("line-dasharray" in (layer.paint ?? {})));
    const dashed = lines.find((layer) => "line-dasharray" in (layer.paint ?? {}));
    expect(solid?.paint).toEqual({
      "line-color": ["get", "color"],
      "line-width": 1,
      "line-opacity": 1,
    });
    expect(solid && "filter" in solid ? solid.filter : undefined).toEqual([
      "all",
      ["!", ["in", ["get", "kind"], ["literal", ["hint", "other", "start", "destination"]]]],
      ["==", ["get", "connected"], true],
    ]);
    expect(dashed && "filter" in dashed ? dashed.filter : undefined).toEqual([
      "==",
      ["get", "connected"],
      false,
    ]);
  });

  test("draws hint outlines unfilled, as a thin white line at half opacity", () => {
    const fill = style.layers.find((layer) => layer.id === "kommun-fill");
    expect(fill && "filter" in fill ? fill.filter : undefined).toEqual([
      "!",
      ["in", ["get", "kind"], ["literal", ["hint", "other"]]],
    ]);
    const hint = style.layers.find((layer) => layer.id === "hint-outline");
    expect(hint).toMatchObject({
      type: "line",
      filter: ["==", ["get", "kind"], "hint"],
      paint: { "line-color": "#ffffff", "line-width": 1, "line-opacity": 0.5 },
    });
  });

  test("once finished, outlines every other kommun unfilled, fainter than hint outlines", () => {
    const other = style.layers.find((layer) => layer.id === "other-outline");
    expect(other).toMatchObject({
      type: "line",
      filter: ["==", ["get", "kind"], "other"],
      paint: { "line-color": "#ffffff", "line-width": 1, "line-opacity": 0.35 },
    });
  });

  test("an invisible fill over every drawn kommun catches hovers and taps for tooltips", () => {
    const target = style.layers.find((layer) => layer.id === TOOLTIP_LAYER);
    expect(target).toMatchObject({ type: "fill", paint: { "fill-opacity": 0 } });
    expect(target && "filter" in target ? target.filter : undefined).toBeUndefined();
  });
});

describe("mapOptions", () => {
  const options = mapOptions([12, 56, 17, 59]);

  test("starts fitted to the endpoints", () => {
    expect(options.bounds).toEqual([12, 56, 17, 59]);
  });

  test.each([270, 360, 864, 1200])(
    "leaves room for the whole length of Sweden in a 4:3 map %ipx wide",
    (width) => {
      const sweden = [10.98, 55.34, 24.16, 69.06];
      const mercatorY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
      const latitudeOf = (y: number) =>
        ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI;
      const height = (width * 3) / 4;
      const padding = fitPadding({ width, height });
      const radiansPerPixel =
        (mercatorY(sweden[3]!) - mercatorY(sweden[1]!)) / (height - 2 * padding);
      const centerY = (mercatorY(sweden[1]!) + mercatorY(sweden[3]!)) / 2;
      const halfWidthDegrees = ((width / 2) * radiansPerPixel * 180) / Math.PI;
      const centerLongitude = (sweden[0]! + sweden[2]!) / 2;
      const [west, south, east, north] = options.maxBounds;
      expect(west).toBeLessThanOrEqual(centerLongitude - halfWidthDegrees);
      expect(east).toBeGreaterThanOrEqual(centerLongitude + halfWidthDegrees);
      expect(south).toBeLessThanOrEqual(latitudeOf(centerY - (height / 2) * radiansPerPixel));
      expect(north).toBeGreaterThanOrEqual(latitudeOf(centerY + (height / 2) * radiansPerPixel));
    },
  );

  test("pads fitted views by 5% of the map's smaller side", () => {
    expect(fitPadding({ width: 864, height: 648 })).toBe(32);
    expect(fitPadding({ width: 272, height: 204 })).toBe(10);
    expect(mapOptions(undefined, { size: { width: 400, height: 300 } }).fitBoundsOptions).toEqual({
      padding: 15,
    });
  });

  test("can't be rotated or tilted", () => {
    expect(options).toMatchObject({ dragRotate: false, pitchWithRotate: false, maxPitch: 0 });
  });

  test("uses a compact attribution control", () => {
    expect(options.attributionControl).toEqual({ compact: true });
  });

  test("on touch screens, one finger scrolls the page and two fingers move the map", () => {
    const touch = mapOptions([12, 56, 17, 59], { touchScreen: true });
    expect(touch.cooperativeGestures).toBe(true);
    expect(touch.locale).toMatchObject({
      "CooperativeGesturesHandler.MobileHelpText": "Använd två fingrar för att flytta kartan",
    });
  });

  test("the focusable map and its zoom buttons are named in Swedish, with the keys that move it", () => {
    expect(options.locale).toMatchObject({
      "Map.Title": "Karta. Piltangenterna flyttar kartan, plus och minus zoomar.",
      "NavigationControl.ZoomIn": "Zooma in",
      "NavigationControl.ZoomOut": "Zooma ut",
    });
  });

  test("with a mouse, the wheel zooms the map as usual", () => {
    expect(options.cooperativeGestures).toBe(false);
  });
});
