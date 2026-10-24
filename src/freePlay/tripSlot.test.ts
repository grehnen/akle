import { describe, expect, test } from "bun:test";
import { newGame, STANDARD_RULES } from "../engine/game";
import { buildGraphVersion } from "../graph/graphVersion";
import { memoryStorage } from "../progress/storage";
import type { LinkedTrip } from "./linkPayload";
import { resumeTrip, saveTripSlot, storedTrip } from "./tripSlot";

// Nynäshamn ── Haninge ── Salem ── Trosa.
const graph = buildGraphVersion({
  id: "current",
  startsAtTrip: 1,
  kommuner: [
    { code: "0192", name: "Nynäshamn" },
    { code: "0136", name: "Haninge" },
    { code: "0128", name: "Salem" },
    { code: "0488", name: "Trosa" },
  ],
  links: [
    { between: ["0192", "0136"], kind: "land" },
    { between: ["0136", "0128"], kind: "land" },
    { between: ["0128", "0488"], kind: "land" },
  ],
});
const version = { graph, ordinal: 2 };

const trip: LinkedTrip = { start: "0192", destination: "0488", mode: { kind: "standard" } };

describe("the trip slot", () => {
  test("resumes the stored trip's guesses, hints and whether it was drawn", () => {
    const storage = memoryStorage();
    const game = {
      ...newGame(trip, STANDARD_RULES),
      guesses: ["0136"],
      hints: { taken: 1, nextKommun: "0128" },
    };
    saveTripSlot(storage, { versionOrdinal: 2, trip, game, drawn: true });

    expect(resumeTrip(storage, version, trip, STANDARD_RULES)).toEqual({ game, drawn: true });
    expect(storedTrip(storage)).toEqual({ versionOrdinal: 2, trip });
  });

  test.each<[string, LinkedTrip, number]>([
    ["reversed endpoints", { ...trip, start: "0488", destination: "0192" }, 2],
    ["another mode", { ...trip, mode: { kind: "unlimited" } }, 2],
    ["another version", trip, 1],
  ])("doesn't resume a trip with %s", (_, other, ordinal) => {
    const storage = memoryStorage();
    saveTripSlot(storage, { versionOrdinal: 2, trip, game: newGame(trip), drawn: false });

    expect(resumeTrip(storage, { graph, ordinal }, other, STANDARD_RULES)).toBeUndefined();
  });

  test("compares a timed trip's thinking time", () => {
    const storage = memoryStorage();
    const timed: LinkedTrip = { ...trip, mode: { kind: "timed", thinkingTime: 10 } };
    saveTripSlot(storage, { versionOrdinal: 2, trip: timed, game: newGame(timed), drawn: false });
    const slower: LinkedTrip = { ...trip, mode: { kind: "timed", thinkingTime: 20 } };

    expect(resumeTrip(storage, version, timed, STANDARD_RULES)).toBeDefined();
    expect(resumeTrip(storage, version, slower, STANDARD_RULES)).toBeUndefined();
  });

  test("drops guesses and hints its version no longer allows", () => {
    const storage = memoryStorage();
    const slot = {
      format: 1,
      versionOrdinal: 2,
      trip,
      drawn: false,
      game: { guesses: ["0136", "9999", "0136", "0488"], hints: { taken: 4, nextKommun: "0128" } },
    };
    storage.setItem("akle:free-play-trip", JSON.stringify(slot));

    expect(resumeTrip(storage, version, trip, STANDARD_RULES)?.game).toEqual({
      ...newGame(trip),
      guesses: ["0136"],
    });
  });

  test.each([
    ["no JSON", "{not json"],
    ["an unknown format", JSON.stringify({ format: 2, versionOrdinal: 2, trip, drawn: false })],
    ["no format", JSON.stringify({ versionOrdinal: 2, trip, drawn: false, game: { guesses: [] } })],
    [
      "a trip without a mode",
      JSON.stringify({
        format: 1,
        versionOrdinal: 2,
        trip: { start: "0192", destination: "0488" },
        drawn: false,
        game: { guesses: [] },
      }),
    ],
    [
      "a thinking time out of range",
      JSON.stringify({
        format: 1,
        versionOrdinal: 2,
        trip: { ...trip, mode: { kind: "timed", thinkingTime: 99 } },
        drawn: false,
        game: { guesses: [] },
      }),
    ],
    ["no guesses", JSON.stringify({ format: 1, versionOrdinal: 2, trip, drawn: false, game: {} })],
    ["a list", "[]"],
  ])("a slot with %s is ignored as empty", (_, text) => {
    const storage = memoryStorage();
    storage.setItem("akle:free-play-trip", text);

    expect(storedTrip(storage)).toBeUndefined();
    expect(resumeTrip(storage, version, trip, STANDARD_RULES)).toBeUndefined();
  });

  test("a new trip replaces the slot", () => {
    const storage = memoryStorage();
    saveTripSlot(storage, { versionOrdinal: 2, trip, game: newGame(trip), drawn: false });
    const next: LinkedTrip = { start: "0136", destination: "0488", mode: { kind: "standard" } };
    saveTripSlot(storage, { versionOrdinal: 2, trip: next, game: newGame(next), drawn: true });

    expect(storedTrip(storage)).toEqual({ versionOrdinal: 2, trip: next });
    expect(resumeTrip(storage, version, trip, STANDARD_RULES)).toBeUndefined();
  });
});
