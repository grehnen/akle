import { describe, expect, test } from "bun:test";
import { foldedNameCollisions } from "../engine/kommunNames";
import type { GraphVersion } from "../graph/graphVersion";
import { graphVersionFor, parseGraphVersionFiles } from "../graph/graphVersionFiles";
import { shortestRouteLength } from "../graph/routes";
import { parseScheduleChunk, parseScheduleConfig } from "../schedule/schedule";

const dataDirectory = new URL("../../data/", import.meta.url);
const readText = (path: string) => Bun.file(new URL(path, dataDirectory)).text();

const versionIds = [
  ...new Bun.Glob("*/version.json").scanSync(new URL("graphs", dataDirectory).pathname),
]
  .map((path) => path.split("/")[0])
  .sort();
const graphVersions: GraphVersion[] = await Promise.all(
  versionIds.map(async (id) =>
    parseGraphVersionFiles({
      version: JSON.parse(await readText(`graphs/${id}/version.json`)),
      kommuner: await readText(`graphs/${id}/kommuner.csv`),
      neighbors: await readText(`graphs/${id}/neighbors.csv`),
      shapes: JSON.parse(await readText(`graphs/${id}/shapes.geojson`)),
    }),
  ),
);
const osmGraph = graphVersions.find((graph) => graph.id === "osm-2026-10-01");
const schedule = parseScheduleChunk(await readText("schedule/0001.csv"));

const codeOf = (graph: GraphVersion, name: string) =>
  [...graph.kommuner.values()].find((kommun) => kommun.name === name)?.code;

describe("committed data", () => {
  test("the schedule config has an epoch and seed", async () => {
    const config = JSON.parse(await readText("schedule/config.json"));
    expect(() => parseScheduleConfig(config)).not.toThrow();
  });

  test.each(versionIds)(
    "graph version %s matches its directory and has a shape per kommun",
    (id) => {
      const graph = graphVersions[versionIds.indexOf(id)];
      expect(graph.id).toBe(id);
      const shapeCodes = graph.shapes.features.map((feature) => feature.properties.code).sort();
      expect(shapeCodes).toEqual([...graph.kommuner.keys()].sort());
    },
  );

  // ADR 0004: only the newest version goes through the ADR 0003 checks; older ones are frozen.
  test("the newest graph version has no names that collide after folding", () => {
    const graph = graphVersions.reduce((newest, version) =>
      version.startsAtPuzzle > newest.startsAtPuzzle ? version : newest,
    );
    const names = [...graph.kommuner.values()].map((kommun) => kommun.name);
    expect(foldedNameCollisions(names)).toEqual([]);
  });

  test("the OSM graph version has all 290 kommuner with official names", () => {
    expect(osmGraph?.kommuner.size).toBe(290);
    expect(osmGraph?.kommuner.get("0980")?.name).toBe("Gotland");
    expect(osmGraph?.kommuner.get("1480")?.name).toBe("Göteborg");
    expect(osmGraph?.kommuner.get("0360")?.name).toBe("Tierp");
  });

  test("puzzles from #31 on are played on the OSM graph version", () => {
    expect(graphVersionFor(graphVersions, 30)?.id).toBe("fixture");
    expect(graphVersionFor(graphVersions, 31)?.id).toBe("osm-2026-10-01");
  });

  test("the OSM graph version links kommuner by land borders only", () => {
    const graph = osmGraph!;
    expect(new Set(graph.links.map((link) => link.kind))).toEqual(new Set(["land"]));
    for (const island of ["Gotland", "Lidingö", "Tjörn", "Öckerö"]) {
      expect({ island, neighbors: graph.neighbors.get(codeOf(graph, island)!)?.size }).toEqual({
        island,
        neighbors: 0,
      });
    }
    const ekeroNeighbors = [...graph.neighbors.get(codeOf(graph, "Ekerö")!)!];
    for (const acrossMalaren of ["Upplands-Bro", "Järfälla", "Botkyrka", "Strängnäs"]) {
      expect(ekeroNeighbors).not.toContain(codeOf(graph, acrossMalaren));
    }
  });

  test("schedule rows are numbered from 1 without gaps", () => {
    expect(schedule.map((row) => row.number)).toEqual(schedule.map((_, index) => index + 1));
  });

  test("every schedule row's N matches its graph version", () => {
    for (const row of schedule) {
      const graph = graphVersionFor(graphVersions, row.number)!;
      expect({
        row: row.number,
        n: shortestRouteLength(graph, row.start, row.destination),
      }).toEqual({
        row: row.number,
        n: row.n,
      });
    }
  });
});
