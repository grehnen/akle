import { describe, expect, test } from "bun:test";
import { graphReport } from "./graphReport";
import type { NeighborReview } from "./neighborReview";

const kommuner = [
  { code: "0125", name: "Ekerö" },
  { code: "0180", name: "Stockholm" },
  { code: "0186", name: "Lidingö" },
  { code: "0127", name: "Botkyrka" },
];

const review: NeighborReview = {
  links: [
    { between: ["0125", "0127"], kind: "land" },
    { between: ["0125", "0180"], kind: "land" },
    { between: ["0180", "0186"], kind: "fixed" },
  ],
  flaggedPairs: [
    {
      between: ["0125", "0180"],
      kinds: ["short-border"],
      landLength: 42,
      at: [17.83261, 59.3684],
      built: ["land"],
    },
    {
      between: ["0180", "0186"],
      kinds: ["scb-mismatch", "fixed-only"],
      scb: "only OSM",
      landLength: 0,
      ways: [4054906, 23353186],
      at: [18.1, 59.35],
      built: ["fixed"],
      verdict: { action: "keep", reason: "Lidingöbron | a real bridge." },
    },
  ],
  problems: ["0125-0180 (Ekerö–Stockholm) is flagged short-border but has no verdict"],
  graphProblems: [],
};

const report = graphReport({
  version: { id: "osm-test", startsAtPuzzle: 31 },
  kommuner,
  review,
  previous: {
    id: "fixture",
    kommuner,
    links: [
      { between: ["0125", "0180"], kind: "land" },
      { between: ["0127", "0180"], kind: "land" },
    ],
  },
});

describe("graphReport", () => {
  test("lists every flag with its kinds, measurements, map link and verdict", () => {
    expect(report).toContain(
      "| Ekerö–Stockholm | 0125-0180 | short-border | land border 42 m | [map](https://www.openstreetmap.org/?mlat=59.3684&mlon=17.83261#map=17/59.3684/17.83261) | neighbors (land) | **none** |",
    );
    expect(report).toContain(
      "| Stockholm–Lidingö | 0180-0186 | scb-mismatch, fixed-only | only OSM; land border 0 m; ways [4054906](https://www.openstreetmap.org/way/4054906) [23353186](https://www.openstreetmap.org/way/23353186) | [map](https://www.openstreetmap.org/?mlat=59.35&mlon=18.1#map=17/59.35/18.1) | neighbors (fixed) | keep: Lidingöbron \\| a real bridge. |",
    );
  });

  test("counts the flags and lists the problems that fail the check", () => {
    expect(report).toContain("2 flagged pairs, 1 without a verdict.");
    expect(report).toContain(
      "- 0125-0180 (Ekerö–Stockholm) is flagged short-border but has no verdict",
    );
  });

  test("lists the pairs added and removed since the previous graph version", () => {
    expect(report).toContain("## Changes since the previous graph version (fixture)");
    expect(report).toContain(
      "### Added (2)\n\n- Ekerö–Botkyrka (0125-0127, land)\n- Stockholm–Lidingö (0180-0186, fixed)\n",
    );
    expect(report).toContain("### Removed (1)\n\n- Botkyrka–Stockholm (0127-0180, land)\n");
  });

  test("says when there is no previous graph version", () => {
    expect(
      graphReport({ version: { id: "first", startsAtPuzzle: 1 }, kommuner, review }),
    ).toContain("No previous graph version.");
  });
});
