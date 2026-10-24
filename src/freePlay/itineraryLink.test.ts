import { describe, expect, test } from "bun:test";
import type { DailyTripSource } from "../daily/loadDailyTrip";
import type { GraphVersionFiles } from "../graph/graphVersionFiles";
import { itineraryLinkPath, openItineraryLink } from "./itineraryLink";
import { decodeLinkPayload, encodeLinkPayload, type LinkedTrip } from "./linkPayload";

const trips: LinkedTrip[] = [
  { start: "0192", destination: "0488", mode: { kind: "standard" } },
  { start: "0488", destination: "0136", mode: { kind: "timed", thinkingTime: 45 } },
  { start: "0192", destination: "0488", mode: { kind: "tie-breaker" } },
];

/** The link's path, its title and its decoded payload. */
function opened(link: string) {
  const url = new URL(link, "https://akle.example");
  return {
    path: url.pathname,
    title: url.searchParams.get("namn"),
    payload: decodeLinkPayload(url.searchParams.get("r") ?? ""),
  };
}

describe("an itinerary's link", () => {
  test("opens /resplan with its title, its version and its trips in order", () => {
    expect(opened(itineraryLinkPath(2, "Fredag & lördag?", trips))).toEqual({
      path: "/resplan",
      title: "Fredag & lördag?",
      payload: { ok: true, payload: { versionOrdinal: 2, trips } },
    });
  });

  test("carries no title when the itinerary has none", () => {
    const link = itineraryLinkPath(0, "  ", trips);
    expect(link).not.toContain("namn");
    expect(opened(link).payload).toEqual({ ok: true, payload: { versionOrdinal: 0, trips } });
  });

  test("trims the title", () => {
    expect(opened(itineraryLinkPath(0, " Fredagsresan ", trips)).title).toBe("Fredagsresan");
  });
});

/** "old": Nynäshamn ── Haninge ── Salem ── Trosa. */
const oldFiles: GraphVersionFiles = {
  version: { id: "old", startsAtTrip: 1 },
  kommuner: "code,name\n0192,Nynäshamn\n0136,Haninge\n0128,Salem\n0488,Trosa\n",
  neighbors: "a,b,link\n0192,0136,land\n0136,0128,land\n0128,0488,land\n",
  shapes: { type: "FeatureCollection", features: [] },
};

/** Launch on 2026-10-01; "old" from trip #1, "future" from #900, which can't be loaded. */
function fakeSource() {
  const fetched: string[] = [];
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
      { id: "old", startsAtTrip: 1 },
    ],
    graphVersionFiles: async (id) => {
      fetched.push(id);
      if (id !== "old") throw new Error(`no files for ${id}`);
      return oldFiles;
    },
  };
  return { source, fetched };
}

const today = new Date(2026, 9, 24, 12, 0);
const standard = (start: string, destination: string): LinkedTrip => ({
  start,
  destination,
  mode: { kind: "standard" },
});
const packed = (versionOrdinal: number, ...linked: LinkedTrip[]) =>
  encodeLinkPayload({ versionOrdinal, trips: linked });

describe("opening an itinerary link", () => {
  test("gives its title and every trip in order on its pinned version, loaded once", async () => {
    const { source, fetched } = fakeSource();
    const itinerary = await openItineraryLink(source, today, "Fredagsresan", packed(0, ...trips));
    expect(itinerary.kind).toBe("itinerary");
    if (itinerary.kind !== "itinerary") return;
    expect(itinerary.title).toBe("Fredagsresan");
    expect(itinerary.trips).toEqual(trips);
    expect(itinerary.version.graph.id).toBe("old");
    expect(itinerary.version.ordinal).toBe(0);
    expect(fetched).toEqual(["old"]);
  });

  test("without a title, or a blank one, has none", async () => {
    const { source } = fakeSource();
    for (const title of [null, undefined, "", "   "]) {
      const itinerary = await openItineraryLink(source, today, title, packed(0, ...trips));
      expect(itinerary.kind === "itinerary" && itinerary.title).toBeUndefined();
    }
  });

  test("takes a title of exactly 40 characters", async () => {
    const itinerary = await openItineraryLink(
      fakeSource().source,
      today,
      "x".repeat(40),
      packed(0, ...trips),
    );
    expect(itinerary.kind).toBe("itinerary");
  });
});

describe("an invalid itinerary link", () => {
  const open = (payload: string, title: string | null = null) =>
    openItineraryLink(fakeSource().source, today, title, payload);
  const twenty = Array.from({ length: 20 }, () => standard("0192", "0128"));

  test("takes 2 and 20 trips", async () => {
    expect((await open(packed(0, ...twenty))).kind).toBe("itinerary");
    expect((await open(packed(0, ...twenty.slice(0, 2)))).kind).toBe("itinerary");
  });

  test.each([
    ["a bad checksum", `${packed(0, ...trips).slice(0, -1)}A`],
    ["an unknown format version", `I${packed(0, ...trips).slice(1)}`],
    ["garbage", "not a payload!"],
    ["one trip", packed(0, standard("0192", "0128"))],
    ["21 trips", packed(0, ...twenty, standard("0192", "0128"))],
    ["an ordinal no started version has", packed(1, ...trips)],
    ["an ordinal no version has", packed(7, ...trips)],
    ["a code its version lacks", packed(0, standard("0192", "0128"), standard("0192", "0999"))],
  ])("with %s names no trip", async (_, payload) => {
    expect(await open(payload)).toEqual({ kind: "invalid" });
  });

  test("with a title over 40 characters is invalid", async () => {
    expect(await open(packed(0, ...trips), "x".repeat(41))).toEqual({ kind: "invalid" });
  });

  test.each([
    ["the same start and destination", standard("0192", "0192"), "Nynäshamn", "Nynäshamn"],
    ["neighbors", standard("0128", "0488"), "Salem", "Trosa"],
  ])("with %s names that trip", async (_, trip, start, destination) => {
    expect(await open(packed(0, standard("0192", "0128"), trip))).toEqual({
      kind: "invalid",
      trip: { start, destination },
    });
  });
});
