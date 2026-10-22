import { describe, expect, test } from "bun:test";
import {
  exclaveEdges,
  mainPartContains,
  sharedBorders,
  sharedVertices,
  type KommunArea,
} from "./sharedBorders";

const square = (x: number, y: number): number[][][] => [
  [
    [x, y],
    [x + 1, y],
    [x + 1, y + 1],
    [x, y + 1],
    [x, y],
  ],
];

describe("sharedBorders", () => {
  test("joins the edges two kommuner share into lines, keyed by the sorted code pair", () => {
    const areas: KommunArea[] = [
      {
        code: "0002",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [1, 0],
              [2, 0],
              [2, 1],
              [1, 1],
              [1, 0.5],
              [1, 0],
            ],
          ],
        },
      },
      {
        code: "0001",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 0.5],
              [1, 1],
              [0, 1],
              [0, 0],
            ],
          ],
        },
      },
    ];
    expect(sharedBorders(areas)).toEqual([
      {
        between: ["0001", "0002"],
        lines: [
          [
            [1, 0],
            [1, 0.5],
            [1, 1],
          ],
        ],
      },
    ]);
  });

  test("a kommun made of several pieces is one node, and a point touch shares no border", () => {
    const areas: KommunArea[] = [
      {
        code: "0001",
        geometry: { type: "MultiPolygon", coordinates: [square(0, 0), square(0, 5)] },
      },
      { code: "0002", geometry: { type: "Polygon", coordinates: square(1, 5) } },
      { code: "0003", geometry: { type: "Polygon", coordinates: square(1, 1) } },
    ];
    expect(sharedBorders(areas)).toEqual([
      {
        between: ["0001", "0002"],
        lines: [
          [
            [1, 5],
            [1, 6],
          ],
        ],
      },
    ]);
  });
});

describe("sharedVertices", () => {
  test("lists the pairs whose boundaries share a vertex, with the shared points in order", () => {
    const areas: KommunArea[] = [
      { code: "0003", geometry: { type: "Polygon", coordinates: square(1, 1) } },
      { code: "0001", geometry: { type: "Polygon", coordinates: square(0, 0) } },
      { code: "0002", geometry: { type: "MultiPolygon", coordinates: [square(1, 0)] } },
      { code: "0004", geometry: { type: "Polygon", coordinates: square(5, 5) } },
    ];
    expect(sharedVertices(areas)).toEqual([
      {
        between: ["0001", "0002"],
        points: [
          [1, 0],
          [1, 1],
        ],
      },
      { between: ["0001", "0003"], points: [[1, 1]] },
      {
        between: ["0002", "0003"],
        points: [
          [1, 1],
          [2, 1],
        ],
      },
    ]);
  });
});

describe("exclaveEdges", () => {
  test("tells which kommun's boundary edges lie on a part other than its largest", () => {
    const largeWithHole: number[][][] = [
      [
        [0, 0],
        [3, 0],
        [3, 3],
        [0, 3],
        [0, 0],
      ],
      [
        [1, 1],
        [1, 2],
        [2, 2],
        [2, 1],
        [1, 1],
      ],
    ];
    const onExclave = exclaveEdges([
      {
        code: "0001",
        geometry: { type: "MultiPolygon", coordinates: [square(5, 0), largeWithHole] },
      },
      { code: "0002", geometry: { type: "Polygon", coordinates: square(6, 0) } },
    ]);
    expect(onExclave("0001", [6, 1], [6, 0])).toBe(true);
    expect(onExclave("0001", [6, 0], [6, 1])).toBe(true);
    expect(onExclave("0002", [6, 0], [6, 1])).toBe(false);
    expect(onExclave("0001", [0, 0], [3, 0])).toBe(false);
    expect(onExclave("0001", [1, 1], [1, 2])).toBe(false);
    expect(onExclave("0003", [6, 0], [6, 1])).toBe(false);
  });
});

describe("mainPartContains", () => {
  test("tells whether a point lies in a kommun's largest part, not on an exclave", () => {
    const inMainPart = mainPartContains([
      {
        code: "0001",
        geometry: {
          type: "MultiPolygon",
          coordinates: [
            square(5, 0),
            [
              [
                [0, 0],
                [3, 0],
                [3, 3],
                [0, 3],
                [0, 0],
              ],
            ],
          ],
        },
      },
      { code: "0002", geometry: { type: "Polygon", coordinates: square(6, 0) } },
    ]);
    expect(inMainPart("0001", [1.5, 1.5])).toBe(true);
    expect(inMainPart("0001", [5.5, 0.5])).toBe(false);
    expect(inMainPart("0002", [6.5, 0.5])).toBe(true);
    expect(inMainPart("0002", [1.5, 1.5])).toBe(false);
    expect(inMainPart("0003", [1.5, 1.5])).toBe(false);
  });
});
