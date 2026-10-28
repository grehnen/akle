import { describe, expect, test } from "bun:test";
import type { GraphVersionFiles } from "../graph/graphVersionFiles";
import { type DailyTripSource, loadDailyTrip } from "./loadDailyTrip";

function graphFiles(id: string, startsAtTrip: number): GraphVersionFiles {
  return {
    version: { id, startsAtTrip },
    kommuner: "code,name\n01,Ett\n02,Två\n03,Tre\n",
    neighbors: "a,b,link\n01,02,land\n02,03,land\n",
    shapes: { type: "FeatureCollection", features: [] },
  };
}

/** An in-memory source that records which chunks and versions were fetched. */
function fakeSource() {
  const fetched: string[] = [];
  const chunks: Record<number, string> = {
    1: "trip,start,destination,n\n" + rows(1, 1000),
    2: "trip,start,destination,n\n" + rows(1001, 1500),
  };
  const versions = { old: graphFiles("old", 1), new: graphFiles("new", 1200) };
  const source: DailyTripSource = {
    scheduleConfig: async () => ({
      epoch: "2026-10-01",
      seed: "test",
      cooldownDays: 30,
      cooldownDaysByGraphVersion: {},
      lanCooldownDays: 3,
      lanCooldownDaysByGraphVersion: {},
    }),
    graphVersions: async () => [
      { id: "old", startsAtTrip: 1 },
      { id: "new", startsAtTrip: 1200 },
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

const onDay = (tripNumber: number) => new Date(2026, 9, tripNumber, 12, 0);

describe("loadDailyTrip", () => {
  test("loads only today's schedule chunk and graph version", async () => {
    const { source, fetched } = fakeSource();
    const daily = await loadDailyTrip(source, onDay(21));
    expect(daily).toMatchObject({
      kind: "trip",
      trip: { number: 21, start: "01", destination: "03", n: 1 },
    });
    expect(daily.kind === "trip" && daily.graph.id).toBe("old");
    expect(fetched).toEqual(["chunk 1", "graph old"]);
  });

  test("picks the chunk and version for later trip numbers", async () => {
    const { source, fetched } = fakeSource();
    const daily = await loadDailyTrip(source, onDay(1300));
    expect(daily.kind === "trip" && daily.trip.number).toBe(1300);
    expect(fetched).toEqual(["chunk 2", "graph new"]);
  });

  test("has no trip before the epoch", async () => {
    const { source, fetched } = fakeSource();
    expect(await loadDailyTrip(source, new Date(2026, 8, 30, 23, 59))).toEqual({
      kind: "no-trip",
      reason: "before-epoch",
    });
    expect(fetched).toEqual([]);
  });

  test("has no trip once the schedule has run out", async () => {
    const { source } = fakeSource();
    expect(await loadDailyTrip(source, onDay(1501))).toEqual({
      kind: "no-trip",
      reason: "schedule-ended",
    });
    expect(await loadDailyTrip(source, onDay(2001))).toEqual({
      kind: "no-trip",
      reason: "schedule-ended",
    });
  });
});
