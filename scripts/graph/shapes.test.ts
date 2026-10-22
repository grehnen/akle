import { describe, expect, test } from "bun:test";
import type { Feature } from "./osmTools";
import { isInlandWater, isRiver } from "./shapes";

const water = (tags: Feature["properties"]): Feature => ({
  type: "Feature",
  properties: tags,
  geometry: { type: "Polygon", coordinates: [] },
});

describe("isInlandWater", () => {
  test("counts lakes and river areas", () => {
    expect(isInlandWater(water({ natural: "water" }))).toBe(true);
    expect(isInlandWater(water({ natural: "water", water: "lake" }))).toBe(true);
    expect(isInlandWater(water({ natural: "water", water: "river" }))).toBe(true);
  });

  test("leaves out canals, streams and other channels, and anything that isn't water", () => {
    expect(isInlandWater(water({ natural: "water", water: "canal" }))).toBe(false);
    expect(isInlandWater(water({ natural: "water", water: "stream" }))).toBe(false);
    expect(isInlandWater(water({ natural: "wood" }))).toBe(false);
  });
});

describe("isRiver", () => {
  test("counts only river areas", () => {
    expect(isRiver(water({ natural: "water", water: "river" }))).toBe(true);
    expect(isRiver(water({ natural: "water", water: "lake" }))).toBe(false);
    expect(isRiver(water({ natural: "water" }))).toBe(false);
  });
});
