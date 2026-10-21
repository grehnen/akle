import { describe, expect, test } from "bun:test";
import { sharedBorders, type KommunArea } from "./sharedBorders";

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
