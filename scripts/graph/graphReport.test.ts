import { describe, expect, test } from "bun:test";
import { graphReport } from "./graphReport";
import type { NeighborReview } from "./neighborReview";

const kommuner = [
  { code: "0125", name: "Ekerö" },
  { code: "0180", name: "Stockholm" },
  { code: "0186", name: "Lidingö" },
  { code: "0127", name: "Botkyrka" },
  { code: "0305", name: "Håbo" },
  { code: "0330", name: "Knivsta" },
  { code: "0486", name: "Strängnäs" },
  { code: "1980", name: "Västerås" },
  { code: "1462", name: "Lilla Edet" },
  { code: "1489", name: "Alingsås" },
  { code: "1440", name: "Ale" },
  { code: "0484", name: "Eskilstuna" },
  { code: "1482", name: "Kungälv" },
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
      kinds: ["scb-mismatch"],
      landLength: 0,
      ways: [4054906, 23353186],
      at: [18.1, 59.35],
      built: ["fixed"],
      verdict: { action: "keep", reason: "Lidingöbron | a real bridge." },
    },
    {
      between: ["0305", "0330"],
      kinds: ["non-qualifying-link"],
      landLength: 0,
      ways: [956692672],
      failures: [{ way: 956692672, reasons: ["service=driveway", "no-land-end"] }],
      at: [17.64847, 59.72217],
      built: [],
      verdict: { action: "keep", reason: "A driveway bridge to an islet." },
    },
    {
      between: ["0484", "1980"],
      kinds: ["scb-mismatch"],
      landLength: 1336,
      mainlandLength: 0,
      islandLength: 1336,
      ways: [48675096, 196169497],
      failures: [{ way: 196169497, reasons: ["no-land-end"] }],
      at: [16.65422, 59.48786],
      built: ["land", "fixed"],
      verdict: { action: "keep", reason: "Kvicksundsbron." },
    },
    {
      between: ["0486", "1980"],
      kinds: ["island-border"],
      landLength: 328,
      mainlandLength: 0,
      islandLength: 328,
      at: [16.91903, 59.48324],
      built: ["land"],
      verdict: { action: "keep", reason: "An island in Mälaren." },
    },
    {
      between: ["1462", "1489"],
      kinds: ["exclave-border"],
      landLength: 1003,
      exclaveOf: ["1462"],
      at: [12.41988, 58.05616],
      built: ["land"],
      verdict: { action: "keep", reason: "Lilla Edet's exclave." },
    },
    {
      between: ["1440", "1482"],
      kinds: ["river-border"],
      landLength: 0,
      riverLength: 18695,
      at: [12.04664, 57.90685],
      built: ["land"],
      verdict: { action: "keep", reason: "Göta älv." },
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
      "| Stockholm–Lidingö | 0180-0186 | scb-mismatch | land border 0 m; ways [4054906](https://www.openstreetmap.org/way/4054906) [23353186](https://www.openstreetmap.org/way/23353186) | [map](https://www.openstreetmap.org/?mlat=59.35&mlon=18.1#map=17/59.35/18.1) | neighbors (fixed) | keep: Lidingöbron \\| a real bridge. |",
    );
  });

  test("shows which ways keep a fixed link from qualifying, and why", () => {
    expect(report).toContain(
      "| Håbo–Knivsta | 0305-0330 | non-qualifying-link | land border 0 m; ways [956692672](https://www.openstreetmap.org/way/956692672); not qualifying: [956692672](https://www.openstreetmap.org/way/956692672) service=driveway, an end off the mainland and islands of 1 km² or more | [map](https://www.openstreetmap.org/?mlat=59.72217&mlon=17.64847#map=17/59.72217/17.64847) | not neighbors | keep: A driveway bridge to an islet. |",
    );
  });

  test("lists the failing ways of a fixed link that qualifies through another way", () => {
    expect(report).toContain(
      "| Eskilstuna–Västerås | 0484-1980 | scb-mismatch | land border 1336 m (0 m mainland, 1336 m islands); ways [48675096](https://www.openstreetmap.org/way/48675096) [196169497](https://www.openstreetmap.org/way/196169497); failing ways, the link qualifies through the others: [196169497](https://www.openstreetmap.org/way/196169497) an end off the mainland and islands of 1 km² or more | [map](https://www.openstreetmap.org/?mlat=59.48786&mlon=16.65422#map=17/59.48786/16.65422) | neighbors (land, fixed) | keep: Kvicksundsbron. |",
    );
  });

  test("splits a land border between the mainland and islands, and names whose exclave holds it", () => {
    expect(report).toContain(
      "| Strängnäs–Västerås | 0486-1980 | island-border | land border 328 m (0 m mainland, 328 m islands) |",
    );
    expect(report).toContain(
      "| Lilla Edet–Alingsås | 1462-1489 | exclave-border | land border 1003 m; all on an exclave of Lilla Edet |",
    );
  });

  test("shows the length of a border in river water", () => {
    expect(report).toContain(
      "| Ale–Kungälv | 1440-1482 | river-border | land border 0 m; river border 18695 m |",
    );
  });

  test("counts the flags and lists the problems that fail the check", () => {
    expect(report).toContain("7 flagged pairs, 1 without a verdict.");
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
