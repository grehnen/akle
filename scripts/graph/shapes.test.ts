import { describe, expect, test } from "bun:test";
import type { Feature } from "./osmTools";
import { isBigLake, isInlandWater, isRiver, sharedWaters } from "./shapes";

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

describe("isBigLake", () => {
  const sized = (tags: Feature["properties"], side: number): Feature => ({
    type: "Feature",
    properties: tags,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [15, 60],
          [15 + side, 60],
          [15 + side, 60 + side],
          [15, 60 + side],
          [15, 60],
        ],
      ],
    },
  });

  test("counts lakes of about 10 km² or more", () => {
    expect(isBigLake(sized({ natural: "water", water: "lake" }, 0.1))).toBe(true);
    expect(isBigLake(sized({ natural: "water", water: "lake" }, 0.01))).toBe(false);
  });

  test("never counts river areas, however big", () => {
    expect(isBigLake(sized({ natural: "water", water: "river" }, 0.1))).toBe(false);
  });
});

describe("sharedWaters", () => {
  const square = (west: number, south: number, east: number, north: number) => ({
    type: "Polygon" as const,
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  });
  const kommunAreas = [
    { code: "0001", geometry: square(0, 0, 1, 1) },
    { code: "0002", geometry: square(1, 0, 2, 1) },
  ];
  const lake = (name: string, geometry: Feature["geometry"]): Feature => ({
    type: "Feature",
    properties: { name },
    geometry,
  });
  const names = (waters: readonly Feature[]) => waters.map(({ properties }) => properties.name);

  test("finds a lake across a border, not one inside a kommun", async () => {
    const waters = [
      lake("inside", square(0.2, 0.2, 0.4, 0.4)),
      lake("across", square(0.8, 0.2, 1.2, 0.4)),
    ];
    expect(names(await sharedWaters(kommunAreas, waters))).toEqual(["across"]);
  });

  test("ignores a neighbor's part under 1% of the lake", async () => {
    const waters = [
      lake("sliver", square(0.5, 0.2, 1.004, 0.4)),
      lake("bay", square(0.5, 0.2, 1.01, 0.4)),
    ];
    expect(names(await sharedWaters(kommunAreas, waters))).toEqual(["bay"]);
  });

  test("ignores parts outside every kommun", async () => {
    const waters = [lake("border lake", square(-0.2, 0.2, 0.2, 0.4))];
    expect(await sharedWaters(kommunAreas, waters)).toEqual([]);
  });

  test("measures overlapping lakes separately", async () => {
    const waters = [
      lake("whole", square(0.6, 0.2, 1.4, 0.4)),
      lake("west part", square(0.6, 0.2, 0.99, 0.4)),
      lake("east part", square(1.01, 0.2, 1.4, 0.4)),
    ];
    expect(names(await sharedWaters(kommunAreas, waters))).toEqual(["whole"]);
  });
});
