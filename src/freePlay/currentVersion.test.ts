import { describe, expect, test } from "bun:test";
import type { DailyTripSource } from "../daily/loadDailyTrip";
import type { GraphVersionFiles } from "../graph/graphVersionFiles";
import { loadCurrentGraphVersion } from "./currentVersion";

function graphFiles(id: string, startsAtTrip: number): GraphVersionFiles {
  return {
    version: { id, startsAtTrip },
    kommuner: "code,name\n0101,Ett\n0102,Två\n0103,Tre\n",
    neighbors: "a,b,link\n0101,0102,land\n0102,0103,land\n",
    shapes: { type: "FeatureCollection", features: [] },
  };
}

/** Launch on 2026-10-01 (trip #1); version "old" from trip #1, "new" from trip #20. */
function fakeSource() {
  const fetched: string[] = [];
  const versions = { old: graphFiles("old", 1), new: graphFiles("new", 20) };
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
      { id: "new", startsAtTrip: 20 },
      { id: "old", startsAtTrip: 1 },
    ],
    scheduleChunk: async (chunk) => {
      fetched.push(`chunk ${chunk}`);
      return undefined;
    },
    graphVersionFiles: async (id) => {
      fetched.push(`graph ${id}`);
      return versions[id as keyof typeof versions];
    },
  };
  return { source, fetched };
}

describe("the current version", () => {
  test("is the version today's trip number uses, not a newer one that hasn't started", async () => {
    const { source, fetched } = fakeSource();
    // 2026-10-19 is trip #19, the last day of "old".
    const graph = await loadCurrentGraphVersion(source, new Date(2026, 9, 19, 23, 59));
    expect(graph.id).toBe("old");
    expect(fetched).toEqual(["graph old"]);
  });

  test("moves on once today's trip number reaches a new version", async () => {
    const { source } = fakeSource();
    const graph = await loadCurrentGraphVersion(source, new Date(2026, 9, 20, 0, 1));
    expect(graph.id).toBe("new");
  });

  test("before launch day is the version trip #1 uses", async () => {
    const { source, fetched } = fakeSource();
    const graph = await loadCurrentGraphVersion(source, new Date(2026, 8, 1, 12, 0));
    expect(graph.id).toBe("old");
    // Free play never reads the schedule.
    expect(fetched).toEqual(["graph old"]);
  });
});
