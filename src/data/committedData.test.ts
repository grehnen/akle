import { describe, expect, test } from "bun:test";
import { parseGraphVersionFiles } from "../graph/graphVersionFiles";
import { shortestRouteLength } from "../graph/routes";
import { parseScheduleChunk, parseScheduleConfig } from "../schedule/schedule";

const dataDirectory = new URL("../../data/", import.meta.url);
const readText = (path: string) => Bun.file(new URL(path, dataDirectory)).text();

const fixtureGraph = parseGraphVersionFiles({
  version: JSON.parse(await readText("graphs/fixture/version.json")),
  kommuner: await readText("graphs/fixture/kommuner.csv"),
  neighbors: await readText("graphs/fixture/neighbors.csv"),
  shapes: JSON.parse(await readText("graphs/fixture/shapes.geojson")),
});
const schedule = parseScheduleChunk(await readText("schedule/0001.csv"));

describe("committed data", () => {
  test("the schedule config has an epoch and seed", async () => {
    const config = JSON.parse(await readText("schedule/config.json"));
    expect(() => parseScheduleConfig(config)).not.toThrow();
  });

  test("the fixture graph version starts at puzzle #1 and has a shape per kommun", () => {
    expect(fixtureGraph.startsAtPuzzle).toBe(1);
    const shapeCodes = fixtureGraph.shapes.features
      .map((feature) => feature.properties.code)
      .sort();
    expect(shapeCodes).toEqual([...fixtureGraph.kommuner.keys()].sort());
  });

  test("schedule rows are numbered from 1 without gaps", () => {
    expect(schedule.map((row) => row.number)).toEqual(schedule.map((_, index) => index + 1));
  });

  test("every schedule row's N matches the fixture graph", () => {
    for (const row of schedule) {
      expect({
        row: row.number,
        n: shortestRouteLength(fixtureGraph, row.start, row.destination),
      }).toEqual({
        row: row.number,
        n: row.n,
      });
    }
  });
});
