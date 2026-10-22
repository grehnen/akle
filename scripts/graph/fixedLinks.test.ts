import { describe, expect, test } from "bun:test";
import {
  crossesABorder,
  findFixedLinks,
  qualifies,
  type LinkFailure,
  type LinkWay,
} from "./fixedLinks";
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

// A way from the land south of the strait across the border at height y to the land north of it.
const way = (id: number, y: number, tags: LinkWay["tags"] = {}): LinkWay => ({
  id,
  tags: { highway: "primary", bridge: "yes", ...tags },
  line: [
    [-1, 3],
    [-1, y],
    [1, y],
    [1, 7],
  ],
});

const road = (id: number, line: LinkWay["line"], tags: LinkWay["tags"] = {}): LinkWay => ({
  id,
  tags: { highway: "residential", bridge: "yes", ...tags },
  line,
});

// An island of about 0.4 km² in the strait, just east of the border.
const eastIslet = box(0.001, 4.998, 0.009, 5.002);

describe("findFixedLinks", () => {
  test("a way crossing a border over water links the two kommuner", () => {
    expect(findFixedLinks([border], [way(7, 5)], mask)).toEqual([
      { between: ["0001", "0002"], ways: [7], failures: [] },
    ]);
  });

  test("a road crossing the border on land links the two kommuner too", () => {
    expect(findFixedLinks([border], [way(7, 2, { bridge: undefined })], mask)).toEqual([
      { between: ["0001", "0002"], ways: [7], failures: [] },
    ]);
  });

  test("a way whose end reaches land only on an exclave fails", () => {
    // 0002's main part is the strip 0 < x < 0.5; the land the way reaches at x = 1 is an exclave.
    const offMainPart = (code: string, [x]: number[]) =>
      code === "0001" ? x < 0 : x > 0 && x < 0.5;
    expect(findFixedLinks([border], [way(7, 2)], mask, undefined, offMainPart)).toEqual([
      { between: ["0001", "0002"], ways: [7], failures: [{ way: 7, reasons: ["exclave-end"] }] },
    ]);
  });

  test("a way must reach each kommun's main part on its own side", () => {
    const onlyFirst = (code: string, [x]: number[]) => code === "0001" && x < 0;
    expect(findFixedLinks([border], [way(7, 2)], mask, undefined, onlyFirst)).toEqual([
      { between: ["0001", "0002"], ways: [7], failures: [{ way: 7, reasons: ["exclave-end"] }] },
    ]);
  });

  test("a way that touches the border and turns back crosses nothing", () => {
    const sides = (code: string, [x]: number[]) => (code === "0001" ? x <= 0 : x > 0);
    const touching = road(3, [
      [-1, 2],
      [0, 2],
      [-1, 2.5],
    ]);
    expect(findFixedLinks([border], [touching], mask, undefined, sides)).toEqual([]);
    const through = road(4, [
      [-1, 2],
      [0, 2],
      [1, 2],
    ]);
    expect(findFixedLinks([border], [touching, through], mask, undefined, sides)).toEqual([
      { between: ["0001", "0002"], ways: [4], failures: [] },
    ]);
  });

  test("an end doesn't reach land by crossing another border on land", () => {
    // 0002 is split by a second border at x = 0.5, south of the strait.
    const second: SharedBorder = {
      between: ["0002", "0003"],
      lines: [
        [
          [0.5, 0],
          [0.5, 4.5],
        ],
      ],
    };
    const pier = road(3, [
      [-1, 3],
      [-1, 4.5],
      [0.3, 4.5],
    ]);
    const toLand = road(4, [
      [0.3, 4.5],
      [0.3, 4.6],
      [1, 3],
    ]);
    const links = findFixedLinks([border, second], [pier, toLand], mask);
    expect(links.find((link) => link.between.join() === "0001,0002")).toEqual({
      between: ["0001", "0002"],
      ways: [3],
      failures: [{ way: 3, reasons: ["no-land-end"] }],
    });
  });

  test("a way crossing the border on an island under 1 km² crosses water", () => {
    const islet = box(-0.004, 4.998, 0.004, 5.002);
    expect(findFixedLinks([border], [way(7, 5)], { ...mask, land: [...mask.land, islet] })).toEqual(
      [{ between: ["0001", "0002"], ways: [7], failures: [] }],
    );
  });

  test.each([
    { highway: "construction" },
    { highway: "proposed" },
    { railway: "abandoned", highway: undefined },
    { railway: "disused", highway: undefined },
    { tunnel: "building_passage" },
    { ice_road: "yes" },
    { winter_road: "yes" },
    { ford: "yes" },
    { railway: "ferry", highway: undefined },
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
    expect(links).toEqual([{ between: ["0001", "0002"], ways: [3, 9], failures: [] }]);
  });

  test.each<[LinkWay["tags"], LinkFailure[]]>([
    [{ access: "private" }, ["access=private"]],
    [{ access: "no" }, ["access=no"]],
    [{ highway: "service", service: "driveway" }, ["service=driveway"]],
    [{ highway: "track" }, ["highway=track"]],
  ])("a way tagged %o is a fixed link that isn't public", (tags, reasons) => {
    expect(findFixedLinks([border], [way(7, 5, tags)], mask)).toEqual([
      { between: ["0001", "0002"], ways: [7], failures: [{ way: 7, reasons }] },
    ]);
  });

  test("a link that qualifies lists only its passing ways", () => {
    const links = findFixedLinks(
      [border],
      [way(3, 4.5), way(9, 5.5, { highway: "track", access: "no" })],
      mask,
    );
    expect(links).toEqual([{ between: ["0001", "0002"], ways: [3], failures: [] }]);
  });

  test("a link that doesn't qualify lists every way and why it fails", () => {
    const links = findFixedLinks(
      [border],
      [way(3, 4.5, { access: "private" }), way(9, 5.5, { highway: "track", access: "no" })],
      mask,
    );
    expect(links).toEqual([
      {
        between: ["0001", "0002"],
        ways: [3, 9],
        failures: [
          { way: 3, reasons: ["access=private"] },
          { way: 9, reasons: ["access=no", "highway=track"] },
        ],
      },
    ]);
  });

  test("a way ending on an island under 1 km² doesn't reach land at that end", () => {
    const toIslet = road(7, [
      [-1, 3],
      [-1, 5],
      [0.005, 5],
    ]);
    expect(
      findFixedLinks([border], [toIslet], { ...mask, land: [...mask.land, eastIslet] }),
    ).toEqual([
      { between: ["0001", "0002"], ways: [7], failures: [{ way: 7, reasons: ["no-land-end"] }] },
    ]);
  });

  test("a way that ends in the water doesn't reach land at that end", () => {
    const pier = road(7, [
      [-1, 3],
      [-1, 5],
      [0.5, 5],
    ]);
    expect(findFixedLinks([border], [pier], mask)).toEqual([
      { between: ["0001", "0002"], ways: [7], failures: [{ way: 7, reasons: ["no-land-end"] }] },
    ]);
  });

  test("an end reaches land through the ways joined to it", () => {
    const bridgeStart = road(3, [
      [-1, 3],
      [-1, 5],
      [0.5, 5],
    ]);
    const bridgeEnd = road(4, [
      [0.5, 5],
      [1, 5],
      [1, 7],
    ]);
    expect(findFixedLinks([border], [bridgeStart, bridgeEnd], mask)).toEqual([
      { between: ["0001", "0002"], ways: [3], failures: [] },
    ]);
  });

  test("an end reaches land across an islet, through roads that aren't candidates", () => {
    const toIslet = road(3, [
      [-1, 3],
      [-1, 5],
      [0.005, 5],
    ]);
    const acrossIslet = road(5, [
      [0.005, 5],
      [0.008, 5],
    ]);
    const toLand = road(6, [
      [0.008, 5],
      [1, 5],
      [1, 7],
    ]);
    const isletMask = { ...mask, land: [...mask.land, eastIslet] };
    expect(findFixedLinks([border], [toIslet], isletMask, [toIslet, acrossIslet, toLand])).toEqual([
      { between: ["0001", "0002"], ways: [3], failures: [] },
    ]);
  });

  test("an end doesn't reach land over a ferry", () => {
    const pier = road(3, [
      [-1, 3],
      [-1, 5],
      [0.5, 5],
    ]);
    const ferry = road(4, [
      [0.5, 5],
      [1, 7],
    ]);
    const ferryTags = { highway: undefined, railway: "ferry", bridge: undefined };
    expect(findFixedLinks([border], [pier], mask, [pier, { ...ferry, tags: ferryTags }])).toEqual([
      { between: ["0001", "0002"], ways: [3], failures: [{ way: 3, reasons: ["no-land-end"] }] },
    ]);
  });

  test("an end doesn't reach land by crossing the border back over the water", () => {
    const there = road(3, [
      [-1, 3],
      [-1, 5],
      [0.005, 5],
    ]);
    const back = road(4, [
      [0.005, 5],
      [-1, 5.1],
      [-1, 3],
    ]);
    expect(
      findFixedLinks([border], [there, back], { ...mask, land: [...mask.land, eastIslet] }),
    ).toEqual([
      {
        between: ["0001", "0002"],
        ways: [3, 4],
        failures: [
          { way: 3, reasons: ["no-land-end"] },
          { way: 4, reasons: ["no-land-end"] },
        ],
      },
    ]);
  });
});

describe("crossesABorder", () => {
  test("tells the ways that cross a shared border from those that don't", () => {
    const crosses = crossesABorder([border]);
    expect(crosses(way(7, 2))).toBe(true);
    expect(
      crosses(
        road(8, [
          [1, 1],
          [2, 2],
        ]),
      ),
    ).toBe(false);
  });
});

describe("qualifies", () => {
  test("a link qualifies when at least one of its ways passes", () => {
    expect(qualifies({ ways: [3, 7], failures: [] })).toBe(true);
    expect(
      qualifies({
        ways: [3, 7],
        failures: [{ way: 7, reasons: ["service=driveway"] }],
      }),
    ).toBe(true);
    expect(
      qualifies({
        ways: [3, 7],
        failures: [
          { way: 3, reasons: ["highway=track"] },
          { way: 7, reasons: ["no-land-end"] },
        ],
      }),
    ).toBe(false);
  });
});
