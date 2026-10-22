import { describe, expect, test } from "bun:test";
import { readBuildEvidence } from "./buildEvidenceFiles";
import { graphVersionFileContents } from "./graphVersionWriter";

describe("readBuildEvidence", () => {
  test("reads back what the graph build wrote", () => {
    const files = graphVersionFileContents({
      version: { id: "osm-test", startsAtPuzzle: 3 },
      kommuner: [
        { code: "0125", name: "Ekerö" },
        { code: "0180", name: "Stockholm" },
        { code: "0186", name: "Lidingö" },
      ],
      links: [{ between: ["0125", "0180"], kind: "land" }],
      fixedLinks: [
        {
          between: ["0125", "0180"],
          ways: [30961374, 30961375],
          failures: [{ way: 30961375, reasons: ["access=private", "no-land-end"] }],
        },
        { between: ["0180", "0186"], ways: [4054906], failures: [] },
      ],
      shapes: {
        type: "FeatureCollection",
        features: [
          { type: "Feature", properties: { code: "0180" }, geometry: null },
          { type: "Feature", properties: { code: "0125" }, geometry: null },
        ],
      },
      evidence: {
        landBorders: [
          {
            between: ["0125", "0180"],
            landLength: 42,
            mainlandLength: 12,
            islandLength: 30,
            riverLength: 7,
            exclaveOf: ["0125", "0180"],
            at: [17.83261, 59.3684],
          },
        ],
        pointTouches: [{ between: ["0125", "0180"], at: [17.8, 59.3] }],
        scbPairs: [{ between: ["0125", "0180"], at: [17.8, 59.4] }],
      },
    });
    expect(readBuildEvidence(files)).toEqual({
      kommuner: [
        { code: "0125", name: "Ekerö" },
        { code: "0180", name: "Stockholm" },
        { code: "0186", name: "Lidingö" },
      ],
      shapeCodes: ["0125", "0180"],
      landBorders: [
        {
          between: ["0125", "0180"],
          landLength: 42,
          mainlandLength: 12,
          islandLength: 30,
          riverLength: 7,
          exclaveOf: ["0125", "0180"],
          at: [17.83261, 59.3684],
        },
      ],
      pointTouches: [{ between: ["0125", "0180"], at: [17.8, 59.3] }],
      fixedLinks: [
        {
          between: ["0125", "0180"],
          ways: [30961374, 30961375],
          failures: [{ way: 30961375, reasons: ["access=private", "no-land-end"] }],
        },
        { between: ["0180", "0186"], ways: [4054906], failures: [] },
      ],
      scbPairs: [{ between: ["0125", "0180"], at: [17.8, 59.4] }],
    });
  });

  test("rejects a graph version built without the evidence", () => {
    expect(() =>
      readBuildEvidence({ "kommuner.csv": "code,name\n", "shapes.geojson": "{}" }),
    ).toThrow(/land-borders.csv is missing; rebuild with bun run graph:build/);
  });
});
