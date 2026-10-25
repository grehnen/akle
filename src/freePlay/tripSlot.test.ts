import { describe, expect, test } from "bun:test";
import { giveUp, newGame, reviewGame } from "../engine/game";
import { timeoutRuns } from "../engine/thinkingTime";
import { stampThinkingTime, startTime, stopTimeAtWin, tripTime } from "../engine/tripTime";
import { buildGraphVersion } from "../graph/graphVersion";
import { memoryStorage } from "../progress/storage";
import type { LinkedTrip } from "./linkPayload";
import { freePlayRules } from "./modeRules";
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
const startedAt = Date.UTC(2026, 9, 24, 12, 0, 0);

describe("the trip slot", () => {
  test("resumes the stored trip's guesses, hints and whether it was drawn", () => {
    const storage = memoryStorage();
    const game = {
      ...newGame(trip, freePlayRules(trip.mode)),
      guesses: ["0136"],
      hints: { taken: 1, nextKommun: "0128" },
    };
    saveTripSlot(storage, { versionOrdinal: 2, trip, game, drawn: true });

    expect(resumeTrip(storage, version, trip)).toEqual({ game, drawn: true });
    expect(storedTrip(storage)).toEqual({ versionOrdinal: 2, trip });
  });

  test("resumes the distance range a drawn trip was drawn from", () => {
    const storage = memoryStorage();
    const game = newGame(trip, freePlayRules(trip.mode));
    const range = { min: 1, max: 2 };
    saveTripSlot(storage, { versionOrdinal: 2, trip, game, drawn: true, range });

    expect(resumeTrip(storage, version, trip)).toEqual({ game, drawn: true, range });
  });

  test.each([
    ["not a record", 3],
    ["missing its end", { min: 1 }],
    ["from below 1", { min: 0, max: 2 }],
    ["upside down", { min: 3, max: 2 }],
    ["fractional", { min: 1.5, max: 2 }],
  ])("drops a range that is %s, keeping the trip", (_, range) => {
    const storage = memoryStorage();
    const slot = { format: 1, versionOrdinal: 2, trip, drawn: true, range, game: { guesses: [] } };
    storage.setItem("akle:free-play-trip", JSON.stringify(slot));

    expect(resumeTrip(storage, version, trip)).toEqual({
      game: newGame(trip, freePlayRules(trip.mode)),
      drawn: true,
    });
  });

  test("resumes a given-up trip as given up", () => {
    const storage = memoryStorage();
    // Nynäshamn to Salem is a distance of 1; Trosa is off the route.
    const toSalem: LinkedTrip = { ...trip, destination: "0128" };
    const playing = { ...newGame(toSalem, freePlayRules(toSalem.mode)), guesses: ["0488"] };
    const game = giveUp(graph, playing);
    saveTripSlot(storage, { versionOrdinal: 2, trip: toSalem, game, drawn: false });

    expect(resumeTrip(storage, version, toSalem)?.game).toEqual(game);
    expect(game.givenUp).toBe(true);
  });

  test("keeps a give-up stored before the distance's worth of guesses", () => {
    const storage = memoryStorage();
    const slot = {
      format: 1,
      versionOrdinal: 2,
      trip,
      drawn: false,
      game: { guesses: ["0128"], givenUp: true },
    };
    storage.setItem("akle:free-play-trip", JSON.stringify(slot));

    expect(resumeTrip(storage, version, trip)?.game.givenUp).toBe(true);
  });

  test.each<[string, LinkedTrip, number]>([
    ["reversed endpoints", { ...trip, start: "0488", destination: "0192" }, 2],
    ["another mode", { ...trip, mode: { kind: "unlimited" } }, 2],
    ["another version", trip, 1],
  ])("doesn't resume a trip with %s", (_, other, ordinal) => {
    const storage = memoryStorage();
    saveTripSlot(storage, { versionOrdinal: 2, trip, game: newGame(trip), drawn: false });

    expect(resumeTrip(storage, { graph, ordinal }, other)).toBeUndefined();
  });

  test("compares a timed trip's thinking time", () => {
    const storage = memoryStorage();
    const timed: LinkedTrip = { ...trip, mode: { kind: "timed", thinkingTime: 10 } };
    const game = startTime(newGame(timed, freePlayRules(timed.mode)), startedAt);
    saveTripSlot(storage, { versionOrdinal: 2, trip: timed, game, drawn: false });
    const slower: LinkedTrip = { ...trip, mode: { kind: "timed", thinkingTime: 20 } };

    expect(resumeTrip(storage, version, timed)).toBeDefined();
    expect(resumeTrip(storage, version, slower)).toBeUndefined();
  });

  describe("a timed trip", () => {
    const timed: LinkedTrip = { ...trip, mode: { kind: "timed", thinkingTime: 10 } };
    const started = startTime(newGame(timed, freePlayRules(timed.mode)), startedAt);
    const seconds = (count: number) => startedAt + count * 1000;

    test("resumes its guess times, so timeouts across the gap count from real time", () => {
      const storage = memoryStorage();
      const game = stampThinkingTime(graph, { ...started, guesses: ["0136"] }, seconds(4));
      saveTripSlot(storage, { versionOrdinal: 2, trip: timed, game, drawn: false });

      const resumed = resumeTrip(storage, version, timed)?.game;
      expect(resumed).toEqual(game);
      // Reopened an hour later: every thinking time that ran out meanwhile is counted.
      expect(resumed && timeoutRuns(resumed, seconds(4 + 3600 + 2.5))).toEqual([0, 360]);
    });

    test("resumes a finished trip with its timeouts fixed at the end", () => {
      const storage = memoryStorage();
      // Nynäshamn to Salem is a distance of 1; Trosa is off the route.
      const toSalem: LinkedTrip = { ...timed, destination: "0128" };
      const playing = startTime(newGame(toSalem, freePlayRules(toSalem.mode)), startedAt);
      const guessed = stampThinkingTime(graph, { ...playing, guesses: ["0488"] }, seconds(3));
      const game = stampThinkingTime(graph, giveUp(graph, guessed), seconds(25));
      saveTripSlot(storage, { versionOrdinal: 2, trip: toSalem, game, drawn: false });

      const resumed = resumeTrip(storage, version, toSalem)?.game;
      expect(resumed && reviewGame(graph, resumed).timeouts).toBe(2);
      expect(resumed && timeoutRuns(resumed, seconds(9000))).toEqual([0, 2]);
    });

    test.each([
      ["no guess times", {}],
      ["a guess time that isn't a number", { guessedAt: ["soon"] }],
      ["fewer guess times than guesses", { guessedAt: [] }],
    ])("isn't resumed with %s", (_, times) => {
      const storage = memoryStorage();
      const slot = { format: 1, versionOrdinal: 2, trip: timed, drawn: false };
      storage.setItem(
        "akle:free-play-trip",
        JSON.stringify({ ...slot, game: { guesses: ["0136"], startedAt, ...times } }),
      );

      expect(resumeTrip(storage, version, timed)).toBeUndefined();
    });
  });

  describe("a tie-breaker trip", () => {
    const tieBreaker: LinkedTrip = { ...trip, mode: { kind: "tie-breaker" } };
    const started = startTime(newGame(tieBreaker, freePlayRules(tieBreaker.mode)), startedAt);

    test("resumes with its start time, so the clock runs on across the gap", () => {
      const storage = memoryStorage();
      const game = { ...started, guesses: ["0136"] };
      saveTripSlot(storage, { versionOrdinal: 2, trip: tieBreaker, game, drawn: false });

      expect(resumeTrip(storage, version, tieBreaker)?.game).toEqual(game);
    });

    test("resumes a win with its time", () => {
      const storage = memoryStorage();
      const game = stopTimeAtWin(
        graph,
        { ...started, guesses: ["0136", "0128"] },
        startedAt + 83_456,
      );
      saveTripSlot(storage, { versionOrdinal: 2, trip: tieBreaker, game, drawn: false });

      const resumed = resumeTrip(storage, version, tieBreaker)?.game;
      expect(resumed && tripTime(resumed)).toBe(834);
    });

    test.each([
      ["no start time", {}],
      ["a start time that isn't a number", { startedAt: "noon" }],
    ])("isn't resumed with %s, as it never started", (_, times) => {
      const storage = memoryStorage();
      const slot = { format: 1, versionOrdinal: 2, trip: tieBreaker, drawn: false };
      storage.setItem(
        "akle:free-play-trip",
        JSON.stringify({ ...slot, game: { guesses: ["0136"], ...times } }),
      );

      expect(resumeTrip(storage, version, tieBreaker)).toBeUndefined();
    });

    test("drops a win time that isn't a number, keeping no time", () => {
      const storage = memoryStorage();
      const slot = { format: 1, versionOrdinal: 2, trip: tieBreaker, drawn: false };
      const game = { guesses: ["0136", "0128"], startedAt, wonAt: "later" };
      storage.setItem("akle:free-play-trip", JSON.stringify({ ...slot, game }));

      const resumed = resumeTrip(storage, version, tieBreaker)?.game;
      expect(resumed?.startedAt).toBe(startedAt);
      expect(resumed && tripTime(resumed)).toBeUndefined();
    });
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

    expect(resumeTrip(storage, version, trip)?.game).toEqual({
      ...newGame(trip, freePlayRules(trip.mode)),
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
    expect(resumeTrip(storage, version, trip)).toBeUndefined();
  });

  test("a new trip replaces the slot", () => {
    const storage = memoryStorage();
    saveTripSlot(storage, { versionOrdinal: 2, trip, game: newGame(trip), drawn: false });
    const next: LinkedTrip = { start: "0136", destination: "0488", mode: { kind: "standard" } };
    saveTripSlot(storage, { versionOrdinal: 2, trip: next, game: newGame(next), drawn: true });

    expect(storedTrip(storage)).toEqual({ versionOrdinal: 2, trip: next });
    expect(resumeTrip(storage, version, trip)).toBeUndefined();
  });
});
