import { describe, expect, test } from "bun:test";
import { measureLandBorders, pointOnLand } from "./landBorders";
import type { AreaGeometry, SharedBorder } from "./sharedBorders";

const box = (west: number, south: number, east: number, north: number): AreaGeometry => ({
  type: "Polygon",
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

// Along the equator one degree of longitude is 111,195 m on a sphere of radius 6,371,008.8 m.
const border: SharedBorder = {
  between: ["0001", "0002"],
  lines: [
    [
      [0, 0],
      [1, 0],
    ],
  ],
};

describe("measureLandBorders", () => {
  test("counts only the parts of a border on land and outside lakes, and points at the longest", () => {
    const measured = measureLandBorders([border], {
      land: [box(-1, -1, 0.6, 1)],
      lakes: [box(0.25, -1, 0.5, 1)],
    });
    expect(measured).toEqual([{ between: ["0001", "0002"], landLength: 38918, at: [0.125, 0] }]);
  });

  test("a border running only through a lake or the sea has no length on land; it points at its longest segment", () => {
    const measured = measureLandBorders([border], {
      land: [box(-1, -1, 0.5, 1), box(0.7, -1, 2, 1)],
      lakes: [
        {
          type: "Polygon",
          coordinates: [
            [
              [-0.5, -0.5],
              [0.6, -0.5],
              [0.6, 0.5],
              [-0.5, 0.5],
              [-0.5, -0.5],
            ],
          ],
        },
        box(0.65, -1, 1.5, 1),
      ],
    });
    expect(measured).toEqual([{ between: ["0001", "0002"], landLength: 0, at: [0.5, 0] }]);
  });

  test("an island inside a lake is land", () => {
    const lakeWithIsland: AreaGeometry = {
      type: "Polygon",
      coordinates: [
        [
          [0.2, -1],
          [0.8, -1],
          [0.8, 1],
          [0.2, 1],
          [0.2, -1],
        ],
        [
          [0.4, -0.5],
          [0.4, 0.5],
          [0.5, 0.5],
          [0.5, -0.5],
          [0.4, -0.5],
        ],
      ],
    };
    const measured = measureLandBorders([border], {
      land: [box(-1, -1, 2, 1)],
      lakes: [lakeWithIsland],
    });
    expect(measured).toEqual([{ between: ["0001", "0002"], landLength: 55598, at: [0.1, 0] }]);
  });

  // 0.005° is about 556 m at the equator, so these islands are about 0.3 km².
  test("a border on an island under 1 km² in the sea or in a lake isn't on land", () => {
    const lakeWithIslet: AreaGeometry = {
      type: "Polygon",
      coordinates: [
        [
          [0.6, -1],
          [0.8, -1],
          [0.8, 1],
          [0.6, 1],
          [0.6, -1],
        ],
        [
          [0.7, -0.0025],
          [0.7, 0.0025],
          [0.705, 0.0025],
          [0.705, -0.0025],
          [0.7, -0.0025],
        ],
      ],
    };
    const measured = measureLandBorders([border], {
      land: [box(-1, -1, 0.5, 1), box(0.55, -0.0025, 0.555, 0.0025), box(0.6, -1, 2, 1)],
      lakes: [lakeWithIslet],
    });
    expect(measured).toEqual([{ between: ["0001", "0002"], landLength: 77837, at: [0.25, 0] }]);
  });

  test("a border point on an island under 1 km² isn't on land", () => {
    const isOnLand = pointOnLand({
      land: [box(-1, -1, 0.5, 1), box(0.55, -0.0025, 0.555, 0.0025)],
      lakes: [],
    });
    expect(isOnLand([0.552, 0])).toBe(false);
    expect(isOnLand([0.25, 0])).toBe(true);
  });
});
