import { describe, expect, test } from "bun:test";
import { splitExclaves } from "./exclaves";

function box(west: number, south: number, size: number) {
  return [
    [
      [west, south],
      [west + size, south],
      [west + size, south + size],
      [west, south + size],
      [west, south],
    ],
  ];
}

describe("splitExclaves", () => {
  test("keeps a Polygon whole, with no exclaves", () => {
    const polygon = { type: "Polygon", coordinates: box(12, 56, 1) };
    expect(splitExclaves(polygon)).toEqual({ main: polygon, exclaves: undefined });
  });

  test("takes the largest part of a MultiPolygon as the main part, the rest as exclaves", () => {
    const multi = {
      type: "MultiPolygon",
      coordinates: [box(20, 60, 0.1), box(12, 56, 1), box(14, 58, 0.2)],
    };
    expect(splitExclaves(multi)).toEqual({
      main: { type: "Polygon", coordinates: box(12, 56, 1) },
      exclaves: { type: "MultiPolygon", coordinates: [box(20, 60, 0.1), box(14, 58, 0.2)] },
    });
  });

  test("measures area on the sphere, so a part further north counts for less", () => {
    const multi = {
      type: "MultiPolygon",
      coordinates: [box(12, 69, 1), box(12, 55, 0.9)],
    };
    expect(splitExclaves(multi).main).toEqual({ type: "Polygon", coordinates: box(12, 55, 0.9) });
  });

  test("subtracts holes, so a lake inside a part doesn't count as its area", () => {
    const holed = [...box(12, 56, 1), box(12.05, 56.05, 0.9)[0]];
    const multi = { type: "MultiPolygon", coordinates: [holed, box(20, 60, 0.5)] };
    expect(splitExclaves(multi).main).toEqual({ type: "Polygon", coordinates: box(20, 60, 0.5) });
  });

  test("a MultiPolygon of one part has no exclaves", () => {
    const multi = { type: "MultiPolygon", coordinates: [box(12, 56, 1)] };
    expect(splitExclaves(multi)).toEqual({
      main: { type: "Polygon", coordinates: box(12, 56, 1) },
      exclaves: undefined,
    });
  });

  test("leaves any other geometry whole", () => {
    expect(splitExclaves(undefined)).toEqual({ main: undefined, exclaves: undefined });
  });
});
