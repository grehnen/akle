import { describe, expect, test } from "bun:test";
import { foldedNameCollisions } from "../engine/kommunNames";
import { buildGraphVersion, type GraphVersion } from "../graph/graphVersion";
import { graphVersionFor, parseGraphVersionFiles } from "../graph/graphVersionFiles";
import { cheapestRoute, shortestRouteLength, shortestRouteLengthsFrom } from "../graph/routes";
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
  test("the schedule config is valid and its cooldowns name committed graph versions", async () => {
    const config = JSON.parse(await readText("schedule/config.json"));
    expect(() => parseScheduleConfig(config, { graphVersionIds: versionIds })).not.toThrow();
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

  test("puzzles from #24 on are played on the OSM graph version", () => {
    expect(graphVersionFor(graphVersions, 23)?.id).toBe("fixture");
    expect(graphVersionFor(graphVersions, 24)?.id).toBe("osm-2026-10-01");
  });

  test("island kommuner reach the mainland by fixed links, with the OSM way ids recorded", async () => {
    const graph = osmGraph!;
    const fixedLinkWays = new Map(
      (await readText("graphs/osm-2026-10-01/fixed-links.csv"))
        .trim()
        .split("\n")
        .slice(1)
        .map((row) => row.split(","))
        .map(([a, b, ways]) => [`${a}-${b}`, ways.split(" ")]),
    );
    const fixedPair = (a: string, b: string) => {
      const pair = [codeOf(graph, a)!, codeOf(graph, b)!].sort();
      const linked = graph.links.some(
        (link) => link.kind === "fixed" && [...link.between].sort().join() === pair.join(),
      );
      return { pair: `${a}–${b}`, linked, ways: fixedLinkWays.get(pair.join("-")) ?? [] };
    };
    // Lidingöbron, Nockebybron, Tjörnbron, Skåpesundsbron, Nötesundsbron, Skaftöbron, Ölandsbron.
    const bridges: [string, string, string][] = [
      ["Lidingö", "Stockholm", "23427017"],
      ["Ekerö", "Stockholm", "5178953"],
      ["Tjörn", "Stenungsund", "4796177"],
      ["Tjörn", "Orust", "146272533"],
      ["Orust", "Uddevalla", "146214179"],
      ["Lysekil", "Uddevalla", "175706577"],
      ["Mörbylånga", "Kalmar", "305792496"],
    ];
    for (const [a, b, bridgeWay] of bridges) {
      const link = fixedPair(a, b);
      expect({ ...link, hasBridgeWay: link.ways.includes(bridgeWay) }).toEqual({
        pair: `${a}–${b}`,
        linked: true,
        ways: link.ways,
        hasBridgeWay: true,
      });
    }
    expect([...graph.neighbors.get(codeOf(graph, "Borgholm")!)!]).toEqual([
      codeOf(graph, "Mörbylånga")!,
    ]);
    const ekeroNeighbors = [...graph.neighbors.get(codeOf(graph, "Ekerö")!)!];
    for (const acrossMalaren of ["Upplands-Bro", "Järfälla", "Botkyrka", "Strängnäs"]) {
      expect(ekeroNeighbors).not.toContain(codeOf(graph, acrossMalaren));
    }
  });

  test("Gotland and Öckerö are linked only by the three ferries, so both are dead ends", () => {
    const graph = osmGraph!;
    const ferries = graph.ferryLinks.map((link) =>
      link.between
        .map((code) => graph.kommuner.get(code)!.name)
        .sort()
        .join("–"),
    );
    expect(ferries.sort()).toEqual(["Gotland–Nynäshamn", "Gotland–Oskarshamn", "Göteborg–Öckerö"]);
    // Öckerö has a single link, so being a dead end changes no route.
    expect([...graph.deadEnds].sort()).toEqual([
      codeOf(graph, "Gotland")!,
      codeOf(graph, "Öckerö")!,
    ]);
    expect(graph.neighbors.get(codeOf(graph, "Öckerö")!)!.size).toBe(1);
  });

  test("every kommun in the OSM graph version has a neighbor and every other is reachable", () => {
    const graph = osmGraph!;
    for (const code of graph.kommuner.keys()) {
      expect({ code, hasNeighbor: graph.neighbors.get(code)!.size > 0 }).toEqual({
        code,
        hasNeighbor: true,
      });
    }
    expect(shortestRouteLengthsFrom(graph, "0180").size).toBe(graph.kommuner.size - 1);
  });

  test("no shortest route on the OSM graph version passes through Gotland", () => {
    const graph = osmGraph!;
    const gotland = codeOf(graph, "Gotland")!;
    const withoutGotland = buildGraphVersion({
      id: graph.id,
      startsAtPuzzle: graph.startsAtPuzzle,
      kommuner: [...graph.kommuner.values()],
      links: graph.links.filter((link) => !link.between.includes(gotland)),
    });
    for (const from of graph.kommuner.keys()) {
      if (from === gotland) continue;
      const lengths = shortestRouteLengthsFrom(graph, from);
      lengths.delete(gotland);
      expect({ from, lengths }).toEqual({
        from,
        lengths: shortestRouteLengthsFrom(withoutGotland, from),
      });
    }
    const nynashamn = codeOf(graph, "Nynäshamn")!;
    const oskarshamn = codeOf(graph, "Oskarshamn")!;
    expect(shortestRouteLength(graph, nynashamn, oskarshamn)).toBeGreaterThan(1);
    expect(cheapestRoute(graph, nynashamn, oskarshamn, new Set([gotland]))).not.toContain(gotland);
    expect(shortestRouteLength(graph, gotland, oskarshamn)).toBe(0);
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
