import { describe, expect, test } from "bun:test";
import { mapOptions, SATELLITE_TILE_URL, satelliteMapStyle, TOOLTIP_LAYER } from "./mapStyle";

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

  test("fills drawn kommuner at 0.25 opacity with a 1 px opaque outline in the same hue", () => {
    const fill = style.layers.find((layer) => layer.type === "fill");
    expect(fill?.paint).toEqual({ "fill-color": ["get", "color"], "fill-opacity": 0.25 });
    const lines = style.layers.filter(
      (layer) => layer.type === "line" && layer.id !== "hint-outline",
    );
    for (const line of lines) {
      expect(line.paint).toMatchObject({
        "line-color": ["get", "color"],
        "line-width": 1,
        "line-opacity": 1,
      });
    }
  });

  test("outlines connected kommuner solid and unconnected guesses dashed", () => {
    const lines = style.layers.filter(
      (layer) => layer.type === "line" && layer.id !== "hint-outline",
    );
    const solid = lines.find((layer) => !("line-dasharray" in (layer.paint ?? {})));
    const dashed = lines.find((layer) => "line-dasharray" in (layer.paint ?? {}));
    expect(solid && "filter" in solid ? solid.filter : undefined).toEqual([
      "all",
      ["!=", ["get", "kind"], "hint"],
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
      "!=",
      ["get", "kind"],
      "hint",
    ]);
    const hint = style.layers.find((layer) => layer.id === "hint-outline");
    expect(hint).toMatchObject({
      type: "line",
      filter: ["==", ["get", "kind"], "hint"],
      paint: { "line-color": "#ffffff", "line-width": 1, "line-opacity": 0.5 },
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

  test("with a mouse, the wheel zooms the map as usual", () => {
    expect(options.cooperativeGestures).toBe(false);
  });
});
