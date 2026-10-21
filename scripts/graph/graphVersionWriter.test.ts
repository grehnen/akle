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

  test("writes fixed links as neighbors and records their OSM way ids", () => {
    const withFixedLinks = graphVersionFileContents({
      version: { id: "osm-test", startsAtPuzzle: 3 },
      kommuner: [
        { code: "0180", name: "Stockholm" },
        { code: "0186", name: "Lidingö" },
        { code: "0125", name: "Ekerö" },
      ],
      links: [],
      fixedLinks: [
        { between: ["0186", "0180"], ways: [4054906, 23353186] },
        { between: ["0125", "0180"], ways: [30961374] },
      ],
      shapes: { type: "FeatureCollection", features: [] },
    });
    expect(withFixedLinks["neighbors.csv"]).toBe("a,b,link\n0125,0180,fixed\n0180,0186,fixed\n");
    expect(withFixedLinks["fixed-links.csv"]).toBe(
      "a,b,ways\n0125,0180,30961374\n0180,0186,4054906 23353186\n",
    );
  });
});
