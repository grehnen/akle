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
    expect(splitExclaves(polygon, new Set([0]))).toEqual({ main: polygon, exclaves: undefined });
  });

  test("splits off the listed parts of a MultiPolygon as its exclaves", () => {
    const multi = {
      type: "MultiPolygon",
      coordinates: [box(20, 60, 0.1), box(12, 56, 1), box(14, 58, 0.2)],
    };
    expect(splitExclaves(multi, new Set([0, 2]))).toEqual({
      main: { type: "Polygon", coordinates: box(12, 56, 1) },
      exclaves: { type: "MultiPolygon", coordinates: [box(20, 60, 0.1), box(14, 58, 0.2)] },
    });
  });

  test("keeps every unlisted part in the main part, however small, such as the far side of a lake or an island", () => {
    const multi = {
      type: "MultiPolygon",
      coordinates: [box(12, 56, 1), box(13.1, 56, 0.5), box(14, 58, 0.2)],
    };
    expect(splitExclaves(multi, new Set([2]))).toEqual({
      main: { type: "MultiPolygon", coordinates: [box(12, 56, 1), box(13.1, 56, 0.5)] },
      exclaves: { type: "MultiPolygon", coordinates: [box(14, 58, 0.2)] },
    });
  });

  test("has no exclaves when none are listed", () => {
    const multi = { type: "MultiPolygon", coordinates: [box(12, 56, 1), box(13.1, 56, 0.5)] };
    expect(splitExclaves(multi)).toEqual({ main: multi, exclaves: undefined });
  });

  test("keeps a shape whole when every part is listed, so it is still outlined", () => {
    const multi = { type: "MultiPolygon", coordinates: [box(12, 56, 1)] };
    expect(splitExclaves(multi, new Set([0]))).toEqual({ main: multi, exclaves: undefined });
  });

  test("leaves any other geometry whole", () => {
    expect(splitExclaves(undefined)).toEqual({ main: undefined, exclaves: undefined });
  });
});
