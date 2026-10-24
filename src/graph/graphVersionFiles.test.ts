import { describe, expect, test } from "bun:test";
import { graphVersionFor, parseGraphVersionFiles } from "./graphVersionFiles";

const files = {
  version: { id: "2026-fixture", startsAtTrip: 1 },
  kommuner:
    "code,name\n0192,Nynäshamn\n0181,Södertälje\n0980,Gotland\n0882,Oskarshamn\n0883,Västervik\n",
  neighbors: "a,b,link\n0181,0192,land\n0192,0980,ferry\n0882,0980,ferry\n0882,0883,land\n",
  shapes: {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: { code: "0192" }, geometry: null }],
  },
};

describe("parseGraphVersionFiles", () => {
  test("loads kommuner, neighbors, ferry links, dead ends and shapes as one version", () => {
    const graph = parseGraphVersionFiles(files);
    expect(graph.id).toBe("2026-fixture");
    expect(graph.startsAtTrip).toBe(1);
    expect(graph.kommuner.get("0980")).toEqual({ code: "0980", name: "Gotland" });
    expect([...(graph.neighbors.get("0192") ?? [])].sort()).toEqual(["0181", "0980"]);
    expect(graph.ferryLinks).toHaveLength(2);
    expect([...graph.deadEnds]).toEqual(["0980"]);
    expect(graph.shapes.features).toHaveLength(1);
  });

  test("rejects unknown link kinds and headers", () => {
    expect(() =>
      parseGraphVersionFiles({ ...files, neighbors: "a,b,link\n0181,0192,boat\n" }),
    ).toThrow(/link/);
    expect(() => parseGraphVersionFiles({ ...files, kommuner: "kod,namn\n" })).toThrow(/header/);
  });

  test("rejects a version without a starting trip number", () => {
    expect(() => parseGraphVersionFiles({ ...files, version: { id: "x" } })).toThrow(
      /startsAtTrip/,
    );
  });
});

describe("graphVersionFor", () => {
  const versions = [
    { id: "b", startsAtTrip: 400 },
    { id: "a", startsAtTrip: 1 },
  ];

  test("picks the newest version starting at or before the trip number", () => {
    expect(graphVersionFor(versions, 1)?.id).toBe("a");
    expect(graphVersionFor(versions, 399)?.id).toBe("a");
    expect(graphVersionFor(versions, 400)?.id).toBe("b");
    expect(graphVersionFor(versions, 9999)?.id).toBe("b");
  });

  test("has no version before the first one starts", () => {
    expect(graphVersionFor(versions, 0)).toBeUndefined();
  });
});
