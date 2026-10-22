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
    expect(measured).toEqual([
      {
        between: ["0001", "0002"],
        landLength: 38918,
        mainlandLength: 38918,
        islandLength: 0,
        riverLength: 0,
        exclaveOf: [],
        at: [0.125, 0],
      },
    ]);
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
    expect(measured).toEqual([
      {
        between: ["0001", "0002"],
        landLength: 0,
        mainlandLength: 0,
        islandLength: 0,
        riverLength: 0,
        exclaveOf: [],
        at: [0.5, 0],
      },
    ]);
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
    expect(measured).toEqual([
      {
        between: ["0001", "0002"],
        landLength: 55598,
        mainlandLength: 44478,
        islandLength: 11120,
        riverLength: 0,
        exclaveOf: [],
        at: [0.1, 0],
      },
    ]);
  });

  test("measures the part of a border in a river area apart from lakes and the sea", () => {
    const river = box(0.2, -1, 0.3, 1);
    const measured = measureLandBorders([border], {
      land: [box(-1, -1, 0.8, 1)],
      lakes: [river, box(0.4, -1, 0.5, 1)],
      rivers: [river],
    });
    expect(measured).toEqual([
      {
        between: ["0001", "0002"],
        landLength: 66717,
        mainlandLength: 66717,
        islandLength: 0,
        riverLength: 11120,
        exclaveOf: [],
        at: [0.65, 0],
      },
    ]);
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
    expect(measured).toEqual([
      {
        between: ["0001", "0002"],
        landLength: 77837,
        mainlandLength: 55598,
        islandLength: 22239,
        riverLength: 0,
        exclaveOf: [],
        at: [0.25, 0],
      },
    ]);
  });

  test("splits the land between the mainland, the largest land polygon, and islands of 1 km² or more in the sea or in a lake", () => {
    const lakeWithIsland: AreaGeometry = {
      type: "Polygon",
      coordinates: [
        [
          [0.1, -0.5],
          [0.25, -0.5],
          [0.25, 0.5],
          [0.1, 0.5],
          [0.1, -0.5],
        ],
        [
          [0.15, -0.1],
          [0.15, 0.1],
          [0.2, 0.1],
          [0.2, -0.1],
          [0.15, -0.1],
        ],
      ],
    };
    const [measured] = measureLandBorders([border], {
      land: [box(0.4, -0.5, 0.6, 0.5), box(-1, -1, 0.3, 1)],
      lakes: [lakeWithIsland],
    });
    expect(measured).toMatchObject({
      landLength: 44478,
      mainlandLength: 16679,
      islandLength: 27799,
      riverLength: 0,
    });
  });

  describe("exclaves", () => {
    const exclaveBorder: SharedBorder = {
      between: ["0001", "0002"],
      lines: [
        [
          [0, 0],
          [0.5, 0],
          [1, 0],
        ],
      ],
    };
    const firstHalfOn =
      (code: string) =>
      (kommun: string, from: number[]): boolean =>
        kommun === code && from[0] === 0;

    test("names the kommun whose exclave holds the whole land border, whatever lies in water", () => {
      const [measured] = measureLandBorders(
        [exclaveBorder],
        { land: [box(-1, -1, 0.5, 1)], lakes: [] },
        firstHalfOn("0002"),
      );
      expect(measured).toMatchObject({ landLength: 55598, exclaveOf: ["0002"] });
    });

    test("names none when part of the land border lies off the exclave", () => {
      const [measured] = measureLandBorders(
        [exclaveBorder],
        { land: [box(-1, -1, 0.6, 1)], lakes: [] },
        firstHalfOn("0001"),
      );
      expect(measured).toMatchObject({ exclaveOf: [] });
    });

    test("names both kommuner when the land border joins two exclaves, and none without land", () => {
      const onAnyExclave = () => true;
      const [joined] = measureLandBorders(
        [exclaveBorder],
        { land: [box(-1, -1, 2, 1)], lakes: [] },
        onAnyExclave,
      );
      expect(joined.exclaveOf).toEqual(["0001", "0002"]);
      const [inWater] = measureLandBorders([exclaveBorder], { land: [], lakes: [] }, onAnyExclave);
      expect(inWater.exclaveOf).toEqual([]);
    });
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
