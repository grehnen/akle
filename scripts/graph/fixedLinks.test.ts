import { describe, expect, test } from "bun:test";
import { findFixedLinks, type LinkWay } from "./fixedLinks";
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

// Two kommuner either side of the line x = 0, from y = 0 to y = 10. A strait runs across the
// border between y = 4 and y = 6; elsewhere the border is on land.
const border: SharedBorder = {
  between: ["0001", "0002"],
  lines: [
    [
      [0, 0],
      [0, 10],
    ],
  ],
};
const mask = { land: [box(-5, 0, 5, 4), box(-5, 6, 5, 10)], lakes: [] };

const way = (id: number, y: number, tags: LinkWay["tags"] = {}): LinkWay => ({
  id,
  tags: { highway: "primary", bridge: "yes", ...tags },
  line: [
    [-1, y],
    [1, y],
  ],
});

describe("findFixedLinks", () => {
  test("a way crossing a border over water links the two kommuner", () => {
    expect(findFixedLinks([border], [way(7, 5)], mask)).toEqual([
      { between: ["0001", "0002"], ways: [7] },
    ]);
  });

  test("a way crossing the border on land is no fixed link", () => {
    expect(findFixedLinks([border], [way(7, 2)], mask)).toEqual([]);
  });

  test.each([
    { highway: "construction" },
    { highway: "proposed" },
    { railway: "abandoned", highway: undefined },
    { railway: "disused", highway: undefined },
    { access: "private" },
    { access: "no" },
    { tunnel: "building_passage" },
    { ice_road: "yes" },
    { winter_road: "yes" },
    { ford: "yes" },
  ])("a way tagged %o is no fixed link", (tags) => {
    const unusable = way(7, 5, tags);
    expect(findFixedLinks([border], [unusable], mask)).toEqual([]);
  });

  test("records every crossing way of a pair once, ascending", () => {
    const railway = { highway: undefined, railway: "rail" };
    const links = findFixedLinks(
      [border],
      [way(9, 5.5, railway), way(3, 4.5, { highway: "cycleway" }), way(9, 5.2, railway)],
      mask,
    );
    expect(links).toEqual([{ between: ["0001", "0002"], ways: [3, 9] }]);
  });
});
