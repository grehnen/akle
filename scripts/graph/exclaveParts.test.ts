import { describe, expect, test } from "bun:test";
import type { KommunShapes } from "../../src/graph/graphVersion";
import { exclaveParts, exclavePartsJson } from "./exclaveParts";

function box(west: number, south: number, width: number, height = width) {
  return [
    [
      [west, south],
      [west + width, south],
      [west + width, south + height],
      [west, south + height],
      [west, south],
    ],
  ];
}

const shapes = (geometry: unknown): KommunShapes => ({
  type: "FeatureCollection",
  features: [{ type: "Feature", properties: { code: "0001" }, geometry }],
});

describe("exclaveParts", () => {
  // The boundary: a main part, with a lake down its middle, and an exclave further east.
  const areas = [
    {
      code: "0001",
      geometry: { type: "MultiPolygon" as const, coordinates: [box(12, 56, 1), box(14, 56, 0.2)] },
    },
  ];

  test("lists the drawn parts that lie in an exclave of the boundary", async () => {
    const drawn = { type: "MultiPolygon", coordinates: [box(14, 56, 0.2), box(12, 56, 1)] };
    expect(await exclaveParts(areas, shapes(drawn))).toEqual({ "0001": [0] });
  });

  test("keeps both sides of a lake cut out of the main part", async () => {
    const drawn = {
      type: "MultiPolygon",
      coordinates: [box(12, 56, 0.45, 1), box(12.55, 56, 0.45, 1), box(14, 56, 0.2)],
    };
    expect(await exclaveParts(areas, shapes(drawn))).toEqual({ "0001": [2] });
  });

  test("tests each part well inside it, so an edge simplified across the border doesn't count", async () => {
    // Most of this part's corners lie just outside the main part.
    const drawn = {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [11.99, 55.99],
            [13.01, 55.99],
            [13.01, 57.01],
            [12.5, 56.9],
            [11.99, 55.99],
          ],
        ],
        box(14, 56, 0.2),
      ],
    };
    expect(await exclaveParts(areas, shapes(drawn))).toEqual({ "0001": [1] });
  });

  test("leaves out kommuner drawn in one piece", async () => {
    expect(
      await exclaveParts(areas, shapes({ type: "Polygon", coordinates: box(12, 56, 1) })),
    ).toEqual({});
  });
});

describe("exclavePartsJson", () => {
  test("writes one kommun per line, in code order", () => {
    expect(exclavePartsJson({ "2081": [3, 1], "0382": [2] })).toBe(
      '{\n  "0382": [2],\n  "2081": [1, 3]\n}\n',
    );
    expect(exclavePartsJson({})).toBe("{}\n");
  });
});
