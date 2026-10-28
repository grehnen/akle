import { describe, expect, test } from "bun:test";
import { graphVersionFileContents } from "./graphVersionWriter";
import { checkNeighborGraphReview, neighborGraphReview } from "./neighborGraphReview";

const kommuner = [
  { code: "0125", name: "Ekerö" },
  { code: "0127", name: "Botkyrka" },
  { code: "0180", name: "Stockholm" },
];

/** A graph version as the build writes it: Ekerö–Stockholm is a 42 m land border. */
const built = graphVersionFileContents({
  version: { id: "osm-test", startsAtTrip: 31 },
  kommuner,
  links: [
    { between: ["0125", "0127"], kind: "land" },
    { between: ["0125", "0180"], kind: "land" },
    { between: ["0127", "0180"], kind: "land" },
  ],
  shapes: {
    type: "FeatureCollection",
    features: kommuner.map((kommun) => ({
      type: "Feature" as const,
      properties: { code: kommun.code },
      geometry: null,
    })),
  },
  evidence: {
    landBorders: [
      {
        between: ["0125", "0127"],
        landLength: 9000,
        mainlandLength: 9000,
        islandLength: 0,
        riverLength: 0,
        exclaveOf: [],
        at: [17.8, 59.25],
      },
      {
        between: ["0125", "0180"],
        landLength: 42,
        mainlandLength: 42,
        islandLength: 0,
        riverLength: 0,
        exclaveOf: [],
        at: [17.83261, 59.3684],
      },
      {
        between: ["0127", "0180"],
        landLength: 4000,
        mainlandLength: 4000,
        islandLength: 0,
        riverLength: 0,
        exclaveOf: [],
        at: [17.9, 59.25],
      },
    ],
    pointTouches: [],
  },
});

const removeEkeröStockholm = `
overrides:
  - remove: ["0125", "0180"]
    names: [Ekerö, Stockholm]
    reason: A 42 m sliver across Hässelby holme.
    evidence: https://www.openstreetmap.org/way/1
`;

describe("neighborGraphReview", () => {
  test("applies the overrides to the committed graph and writes the report", () => {
    const result = neighborGraphReview({ files: built, overridesYaml: removeEkeröStockholm });
    expect(result.neighbors).toBe("a,b,link\n0125,0127,land\n0127,0180,land\n");
    expect(result.report).toContain("| Ekerö–Stockholm | 0125-0180 | short-border |");
    expect(result.report).toContain("remove: A 42 m sliver across Hässelby holme.");
    expect(result.problems).toEqual([]);
  });
});

describe("checkNeighborGraphReview", () => {
  test("passes when the committed graph and report match the overrides", () => {
    const { neighbors, report } = neighborGraphReview({
      files: built,
      overridesYaml: removeEkeröStockholm,
    });
    expect(
      checkNeighborGraphReview({
        files: { ...built, "neighbors.csv": neighbors },
        overridesYaml: removeEkeröStockholm,
        committedReport: report,
      }),
    ).toEqual([]);
  });

  test("fails on an unreviewed flag", () => {
    const { report } = neighborGraphReview({ files: built, overridesYaml: "" });
    expect(
      checkNeighborGraphReview({ files: built, overridesYaml: "", committedReport: report }),
    ).toEqual(["0125-0180 (Ekerö–Stockholm) is flagged short-border but has no verdict"]);
  });

  test("fails when the committed graph or report is out of date with the overrides", () => {
    expect(
      checkNeighborGraphReview({
        files: built,
        overridesYaml: removeEkeröStockholm,
        committedReport: "# Old report\n",
      }),
    ).toEqual([
      "osm-test/neighbors.csv is out of date with data/neighbor-overrides.yaml; run bun run graph:review",
      "data/graph-report.md is out of date; run bun run graph:review",
    ]);
  });

  test("fails on a name that doesn't match its code", () => {
    const yaml = removeEkeröStockholm.replace("[Ekerö, Stockholm]", "[Ekerö, Solna]");
    expect(
      checkNeighborGraphReview({ files: built, overridesYaml: yaml, committedReport: "" }),
    ).toEqual(["data/neighbor-overrides.yaml: overrides[0]: 0180 is Stockholm, not Solna"]);
  });
});
