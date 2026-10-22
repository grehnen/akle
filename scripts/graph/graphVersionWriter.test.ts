import { describe, expect, test } from "bun:test";
import { parseGraphVersionFiles } from "../../src/graph/graphVersionFiles";
import { graphVersionFileContents } from "./graphVersionWriter";

const contents = graphVersionFileContents({
  version: { id: "osm-test", startsAtPuzzle: 3, source: { extract: "https://example.org/x.pbf" } },
  kommuner: [
    { code: "0180", name: "Stockholm" },
    { code: "0114", name: "Upplands Väsby" },
  ],
  links: [{ between: ["0180", "0114"], kind: "land" }],
  shapes: {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { code: "0180" }, geometry: null },
      { type: "Feature", properties: { code: "0114" }, geometry: null },
    ],
  },
});

describe("graphVersionFileContents", () => {
  test("writes files the app reads back as the same graph version", () => {
    const graph = parseGraphVersionFiles({
      version: JSON.parse(contents["version.json"]),
      kommuner: contents["kommuner.csv"],
      neighbors: contents["neighbors.csv"],
      shapes: JSON.parse(contents["shapes.geojson"]),
    });
    expect(graph.id).toBe("osm-test");
    expect(graph.startsAtPuzzle).toBe(3);
    expect([...graph.neighbors.get("0114")!]).toEqual(["0180"]);
  });

  test("sorts kommuner, pairs and shapes by SCB code so a rebuild gives identical files", () => {
    expect(contents["kommuner.csv"]).toBe("code,name\n0114,Upplands Väsby\n0180,Stockholm\n");
    expect(contents["neighbors.csv"]).toBe("a,b,link\n0114,0180,land\n");
    expect(
      JSON.parse(contents["shapes.geojson"]).features.map(
        (feature: { properties: { code: string } }) => feature.properties.code,
      ),
    ).toEqual(["0114", "0180"]);
  });

  test("records the OSM way ids of the detected fixed links and why a link doesn't qualify", () => {
    const withFixedLinks = graphVersionFileContents({
      version: { id: "osm-test", startsAtPuzzle: 3 },
      kommuner: [
        { code: "0180", name: "Stockholm" },
        { code: "0186", name: "Lidingö" },
        { code: "0125", name: "Ekerö" },
      ],
      links: [
        { between: ["0186", "0180"], kind: "fixed" },
        { between: ["0180", "0125"], kind: "land" },
      ],
      fixedLinks: [
        { between: ["0186", "0180"], ways: [4054906, 23353186], failures: [] },
        {
          between: ["0125", "0180"],
          ways: [30961374, 30961375],
          failures: [{ way: 30961375, reasons: ["service=driveway", "no-land-end"] }],
        },
      ],
      shapes: { type: "FeatureCollection", features: [] },
    });
    expect(withFixedLinks["neighbors.csv"]).toBe("a,b,link\n0125,0180,land\n0180,0186,fixed\n");
    expect(withFixedLinks["fixed-links.csv"]).toBe(
      "a,b,ways,failures\n0125,0180,30961374 30961375,30961375:service=driveway+no-land-end\n0180,0186,4054906 23353186,-\n",
    );
  });

  test("writes the evidence the review of flagged pairs reads", () => {
    const withEvidence = graphVersionFileContents({
      version: { id: "osm-test", startsAtPuzzle: 3 },
      kommuner: [],
      links: [],
      shapes: { type: "FeatureCollection", features: [] },
      evidence: {
        landBorders: [
          {
            between: ["0180", "0125"],
            landLength: 42,
            mainlandLength: 0,
            islandLength: 42,
            riverLength: 0,
            exclaveOf: ["0180"],
            at: [17.83261, 59.3684],
          },
          {
            between: ["0114", "0115"],
            landLength: 0,
            mainlandLength: 0,
            islandLength: 0,
            riverLength: 2500,
            exclaveOf: [],
            at: [18, 59.5],
          },
        ],
        pointTouches: [{ between: ["1440", "1407"], at: [11.8, 57.7] }],
      },
    });
    expect(withEvidence["land-borders.csv"]).toBe(
      "a,b,land,mainland,island,river,exclave,at\n0114,0115,0,0,0,2500,-,18 59.5\n0125,0180,42,0,42,0,0180,17.83261 59.3684\n",
    );
    expect(withEvidence["point-touches.csv"]).toBe("a,b,at\n1407,1440,11.8 57.7\n");
  });
});
