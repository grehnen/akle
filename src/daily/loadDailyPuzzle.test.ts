import { describe, expect, test } from "bun:test";
import type { GraphVersionFiles } from "../graph/graphVersionFiles";
import { type DailyPuzzleSource, loadDailyPuzzle } from "./loadDailyPuzzle";

function graphFiles(id: string, startsAtPuzzle: number): GraphVersionFiles {
  return {
    version: { id, startsAtPuzzle },
    kommuner: "code,name\n01,Ett\n02,Två\n03,Tre\n",
    neighbors: "a,b,link\n01,02,land\n02,03,land\n",
    shapes: { type: "FeatureCollection", features: [] },
  };
}

/** An in-memory source that records which chunks and versions were fetched. */
function fakeSource() {
  const fetched: string[] = [];
  const chunks: Record<number, string> = {
    1: "puzzle,start,destination,n\n" + rows(1, 1000),
    2: "puzzle,start,destination,n\n" + rows(1001, 1500),
  };
  const versions = { old: graphFiles("old", 1), new: graphFiles("new", 1200) };
  const source: DailyPuzzleSource = {
    scheduleConfig: async () => ({
      epoch: "2026-10-01",
      seed: "test",
      cooldownDays: 30,
      cooldownDaysByGraphVersion: {},
    }),
    graphVersions: async () => [
      { id: "old", startsAtPuzzle: 1 },
      { id: "new", startsAtPuzzle: 1200 },
    ],
    scheduleChunk: async (chunk) => {
      fetched.push(`chunk ${chunk}`);
      return chunks[chunk];
    },
    graphVersionFiles: async (id) => {
      fetched.push(`graph ${id}`);
      return versions[id as keyof typeof versions];
    },
  };
  return { source, fetched };
}

function rows(from: number, to: number): string {
  let csv = "";
  for (let number = from; number <= to; number++) csv += `${number},01,03,1\n`;
  return csv;
}

const onDay = (puzzleNumber: number) => new Date(2026, 9, puzzleNumber, 12, 0);

describe("loadDailyPuzzle", () => {
  test("loads only today's schedule chunk and graph version", async () => {
    const { source, fetched } = fakeSource();
    const daily = await loadDailyPuzzle(source, onDay(21));
    expect(daily).toMatchObject({
      kind: "puzzle",
      puzzle: { number: 21, start: "01", destination: "03", n: 1 },
    });
    expect(daily.kind === "puzzle" && daily.graph.id).toBe("old");
    expect(fetched).toEqual(["chunk 1", "graph old"]);
  });

  test("picks the chunk and version for later puzzle numbers", async () => {
    const { source, fetched } = fakeSource();
    const daily = await loadDailyPuzzle(source, onDay(1300));
    expect(daily.kind === "puzzle" && daily.puzzle.number).toBe(1300);
    expect(fetched).toEqual(["chunk 2", "graph new"]);
  });

  test("has no puzzle before the epoch", async () => {
    const { source, fetched } = fakeSource();
    expect(await loadDailyPuzzle(source, new Date(2026, 8, 30, 23, 59))).toEqual({
      kind: "no-puzzle",
      reason: "before-epoch",
    });
    expect(fetched).toEqual([]);
  });

  test("has no puzzle once the schedule has run out", async () => {
    const { source } = fakeSource();
    expect(await loadDailyPuzzle(source, onDay(1501))).toEqual({
      kind: "no-puzzle",
      reason: "schedule-ended",
    });
    expect(await loadDailyPuzzle(source, onDay(2001))).toEqual({
      kind: "no-puzzle",
      reason: "schedule-ended",
    });
  });
});
