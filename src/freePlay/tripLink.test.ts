import { describe, expect, test } from "bun:test";
import type { DailyTripSource } from "../daily/loadDailyTrip";
import type { GraphVersionFiles } from "../graph/graphVersionFiles";
import { loadCurrentVersion } from "./currentVersion";
import { encodeLinkPayload, type LinkedTrip } from "./linkPayload";
import { openTripLink, tripLinkPath } from "./tripLink";

const shapes = { type: "FeatureCollection", features: [] };

/** "old": Nynäshamn ── Haninge ── Salem ── Trosa. */
const oldFiles: GraphVersionFiles = {
  version: { id: "old", startsAtTrip: 1 },
  kommuner: "code,name\n0192,Nynäshamn\n0136,Haninge\n0128,Salem\n0488,Trosa\n",
  neighbors: "a,b,link\n0192,0136,land\n0136,0128,land\n0128,0488,land\n",
  shapes,
};

/** "new": Haninge was merged away, so Nynäshamn ── Salem ── Trosa. */
const newFiles: GraphVersionFiles = {
  version: { id: "new", startsAtTrip: 20 },
  kommuner: "code,name\n0192,Nynäshamn\n0128,Salem\n0488,Trosa\n",
  neighbors: "a,b,link\n0192,0128,land\n0128,0488,land\n",
  shapes,
};

/** Launch on 2026-10-01; "old" from trip #1, "new" from #20 (2026-10-20), "future" from #900. */
function fakeSource() {
  const fetched: string[] = [];
  const files: Record<string, GraphVersionFiles> = { old: oldFiles, new: newFiles };
  const source: DailyTripSource = {
    scheduleConfig: async () => ({
      epoch: "2026-10-01",
      seed: "test",
      cooldownDays: 30,
      cooldownDaysByGraphVersion: {},
      lanCooldownDays: 3,
      lanCooldownDaysByGraphVersion: {},
    }),
    scheduleChunk: async () => undefined,
    graphVersions: async () => [
      { id: "future", startsAtTrip: 900 },
      { id: "new", startsAtTrip: 20 },
      { id: "old", startsAtTrip: 1 },
    ],
    graphVersionFiles: async (id) => {
      fetched.push(id);
      const version = files[id];
      if (version === undefined) throw new Error(`no files for ${id}`);
      return version;
    },
  };
  return { source, fetched };
}

const onOldVersion = new Date(2026, 9, 10, 12, 0);
const onNewVersion = new Date(2026, 9, 24, 12, 0);

const standard = (start: string, destination: string): LinkedTrip => ({
  start,
  destination,
  mode: { kind: "standard" },
});

const payloadOf = (path: string) => new URL(path, "https://akle.example").searchParams.get("r");

describe("a trip link", () => {
  test("is /fri?r= with the trip packed on its version", () => {
    expect(tripLinkPath(0, standard("0180", "1280"))).toBe("/fri?r=EAIFoKACI");
  });

  test("pins the version it was made on and plays on it after a newer version arrives", async () => {
    const { source, fetched } = fakeSource();
    const made = await loadCurrentVersion(source, onOldVersion);
    const link = tripLinkPath(made.ordinal, standard("0192", "0128"));

    fetched.length = 0;
    const opened = await openTripLink(source, onNewVersion, payloadOf(link) ?? "");
    expect(opened.kind).toBe("trip");
    if (opened.kind !== "trip") return;
    expect(opened.version.graph.id).toBe("old");
    expect(opened.version.ordinal).toBe(0);
    expect(opened.trip).toEqual(standard("0192", "0128"));
    // Only the pinned version is loaded, never the current one.
    expect(fetched).toEqual(["old"]);
  });

  test("made on the newer version plays on it", async () => {
    const { source } = fakeSource();
    const made = await loadCurrentVersion(source, onNewVersion);
    const opened = await openTripLink(
      source,
      onNewVersion,
      payloadOf(tripLinkPath(made.ordinal, standard("0192", "0488"))) ?? "",
    );
    expect(opened.kind === "trip" && opened.version.graph.id).toBe("new");
  });

  test("keeps every mode and thinking time", async () => {
    const { source } = fakeSource();
    const timed: LinkedTrip = {
      start: "0192",
      destination: "0488",
      mode: { kind: "timed", thinkingTime: 25 },
    };
    const opened = await openTripLink(
      source,
      onOldVersion,
      payloadOf(tripLinkPath(0, timed)) ?? "",
    );
    expect(opened.kind === "trip" && opened.trip).toEqual(timed);
  });
});

describe("an invalid trip link", () => {
  const open = (payload: string, now = onNewVersion) =>
    openTripLink(fakeSource().source, now, payload);
  const packed = (versionOrdinal: number, ...trips: LinkedTrip[]) =>
    encodeLinkPayload({ versionOrdinal, trips });

  test.each([
    ["a bad checksum", "EAIFoKICI"],
    ["an unknown format version", "IAIFoKAHC"],
    ["the reserved format version 15", "8AIFoKAHK"],
    ["garbage", "not a payload!"],
    ["no trips", packed(0)],
    ["two trips", packed(0, standard("0192", "0128"), standard("0128", "0192"))],
    ["an ordinal no version has", packed(5, standard("0192", "0128"))],
  ])("with %s names no trip", async (_, payload) => {
    expect(await open(payload)).toEqual({ kind: "invalid" });
  });

  test("on a version that hasn't started yet is invalid, not a fallback", async () => {
    expect(await open(packed(1, standard("0192", "0128")), onOldVersion)).toEqual({
      kind: "invalid",
    });
    expect(await open(packed(2, standard("0192", "0128")))).toEqual({ kind: "invalid" });
  });

  test("with a code its version lacks is invalid", async () => {
    // Haninge is gone from "new".
    expect(await open(packed(1, standard("0192", "0136")))).toEqual({ kind: "invalid" });
  });

  test.each([
    ["the same start and destination", standard("0192", "0192"), "Nynäshamn", "Nynäshamn"],
    ["neighbors", standard("0192", "0136"), "Nynäshamn", "Haninge"],
  ])("with %s names the trip", async (_, trip, start, destination) => {
    expect(await open(packed(0, trip))).toEqual({ kind: "invalid", trip: { start, destination } });
  });
});
