import { describe, expect, test } from "bun:test";
import { giveUp, newGame, reviewGame } from "../engine/game";
import { timeoutRuns } from "../engine/thinkingTime";
import { stampThinkingTime, startTime, stopTimeAtWin, tripTime } from "../engine/tripTime";
import { buildGraphVersion } from "../graph/graphVersion";
import { type KeyValueStorage, memoryStorage } from "../progress/storage";
import type { LinkedTrip } from "./linkPayload";
import { freePlayRules } from "./modeRules";
import { latestTrip, resumeTrip, saveTrip } from "./tripSaves";

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

/** Stores saves as written by hand, the first the most recently played. */
function storeSave(storage: KeyValueStorage, ...saves: unknown[]) {
  storage.setItem("akle:free-play-trips", JSON.stringify({ format: 1, saves }));
}

describe("a trip's save", () => {
  test("resumes the stored trip's guesses, hints and whether it was drawn", () => {
    const storage = memoryStorage();
    const game = {
      ...newGame(trip, freePlayRules(trip.mode)),
      guesses: ["0136"],
      hints: { taken: 1, nextKommun: "0128" },
    };
    saveTrip(storage, { versionOrdinal: 2, trip, game, drawn: true });

    expect(resumeTrip(storage, version, trip)).toEqual({ game, drawn: true });
    expect(latestTrip(storage)).toEqual({ versionOrdinal: 2, trip });
  });

  test("resumes the distance range a drawn trip was drawn from", () => {
    const storage = memoryStorage();
    const game = newGame(trip, freePlayRules(trip.mode));
    const range = { min: 1, max: 2 };
    saveTrip(storage, { versionOrdinal: 2, trip, game, drawn: true, range });

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
    const save = { versionOrdinal: 2, trip, drawn: true, range, game: { guesses: [] } };
    storeSave(storage, save);

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
    saveTrip(storage, { versionOrdinal: 2, trip: toSalem, game, drawn: false });

    expect(resumeTrip(storage, version, toSalem)?.game).toEqual(game);
    expect(game.givenUp).toBe(true);
  });

  test("keeps a give-up stored before the distance's worth of guesses", () => {
    const storage = memoryStorage();
    const save = {
      versionOrdinal: 2,
      trip,
      drawn: false,
      game: { guesses: ["0128"], givenUp: true },
    };
    storeSave(storage, save);

    expect(resumeTrip(storage, version, trip)?.game.givenUp).toBe(true);
  });

  test.each<[string, LinkedTrip, number]>([
    ["reversed endpoints", { ...trip, start: "0488", destination: "0192" }, 2],
    ["another mode", { ...trip, mode: { kind: "unlimited" } }, 2],
    ["another version", trip, 1],
  ])("doesn't resume a trip with %s", (_, other, ordinal) => {
    const storage = memoryStorage();
    saveTrip(storage, { versionOrdinal: 2, trip, game: newGame(trip), drawn: false });

    expect(resumeTrip(storage, { graph, ordinal }, other)).toBeUndefined();
  });

  test("compares a timed trip's thinking time", () => {
    const storage = memoryStorage();
    const timed: LinkedTrip = { ...trip, mode: { kind: "timed", thinkingTime: 10 } };
    const game = startTime(newGame(timed, freePlayRules(timed.mode)), startedAt);
    saveTrip(storage, { versionOrdinal: 2, trip: timed, game, drawn: false });
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
      saveTrip(storage, { versionOrdinal: 2, trip: timed, game, drawn: false });

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
      saveTrip(storage, { versionOrdinal: 2, trip: toSalem, game, drawn: false });

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
      const save = { versionOrdinal: 2, trip: timed, drawn: false };
      storeSave(storage, { ...save, game: { guesses: ["0136"], startedAt, ...times } });

      expect(resumeTrip(storage, version, timed)).toBeUndefined();
    });
  });

  describe("a tie-breaker trip", () => {
    const tieBreaker: LinkedTrip = { ...trip, mode: { kind: "tie-breaker" } };
    const started = startTime(newGame(tieBreaker, freePlayRules(tieBreaker.mode)), startedAt);

    test("resumes with its start time, so the clock runs on across the gap", () => {
      const storage = memoryStorage();
      const game = { ...started, guesses: ["0136"] };
      saveTrip(storage, { versionOrdinal: 2, trip: tieBreaker, game, drawn: false });

      expect(resumeTrip(storage, version, tieBreaker)?.game).toEqual(game);
    });

    test("resumes a win with its time", () => {
      const storage = memoryStorage();
      const game = stopTimeAtWin(
        graph,
        { ...started, guesses: ["0136", "0128"] },
        startedAt + 83_456,
      );
      saveTrip(storage, { versionOrdinal: 2, trip: tieBreaker, game, drawn: false });

      const resumed = resumeTrip(storage, version, tieBreaker)?.game;
      expect(resumed && tripTime(resumed)).toBe(834);
    });

    test.each([
      ["no start time", {}],
      ["a start time that isn't a number", { startedAt: "noon" }],
    ])("isn't resumed with %s, as it never started", (_, times) => {
      const storage = memoryStorage();
      const save = { versionOrdinal: 2, trip: tieBreaker, drawn: false };
      storeSave(storage, { ...save, game: { guesses: ["0136"], ...times } });

      expect(resumeTrip(storage, version, tieBreaker)).toBeUndefined();
    });

    test("drops a win time that isn't a number, keeping no time", () => {
      const storage = memoryStorage();
      const save = { versionOrdinal: 2, trip: tieBreaker, drawn: false };
      const game = { guesses: ["0136", "0128"], startedAt, wonAt: "later" };
      storeSave(storage, { ...save, game });

      const resumed = resumeTrip(storage, version, tieBreaker)?.game;
      expect(resumed?.startedAt).toBe(startedAt);
      expect(resumed && tripTime(resumed)).toBeUndefined();
    });
  });

  test("drops guesses and hints its version no longer allows", () => {
    const storage = memoryStorage();
    const save = {
      versionOrdinal: 2,
      trip,
      drawn: false,
      game: { guesses: ["0136", "9999", "0136", "0488"], hints: { taken: 4, nextKommun: "0128" } },
    };
    storeSave(storage, save);

    expect(resumeTrip(storage, version, trip)?.game).toEqual({
      ...newGame(trip, freePlayRules(trip.mode)),
      guesses: ["0136"],
    });
  });

  const whole = { versionOrdinal: 2, trip, drawn: false, game: { guesses: [] } };
  test.each<[string, unknown]>([
    ["not a record", "a trip"],
    ["a trip without a mode", { ...whole, trip: { start: "0192", destination: "0488" } }],
    [
      "a thinking time out of range",
      { ...whole, trip: { ...trip, mode: { kind: "timed", thinkingTime: 99 } } },
    ],
    ["no guesses", { ...whole, game: {} }],
    ["no version", { ...whole, versionOrdinal: undefined }],
  ])("a save with %s is skipped, leaving the others readable", (_, broken) => {
    const storage = memoryStorage();
    const other: LinkedTrip = { ...trip, start: "0136" };
    storeSave(storage, broken, { ...whole, trip: other });

    expect(latestTrip(storage)).toEqual({ versionOrdinal: 2, trip: other });
    expect(resumeTrip(storage, version, trip)).toBeUndefined();
    expect(resumeTrip(storage, version, other)?.game.guesses).toEqual([]);
  });

  test.each([
    ["no JSON", "{not json"],
    ["an unknown format", JSON.stringify({ format: 2, saves: [] })],
    ["no list of saves", JSON.stringify({ format: 1, saves: {} })],
    ["a list", "[]"],
  ])("stored saves with %s are read as none, and a new save still goes in", (_, text) => {
    const storage = memoryStorage();
    storage.setItem("akle:free-play-trips", text);

    expect(latestTrip(storage)).toBeUndefined();
    saveTrip(storage, { versionOrdinal: 2, trip, game: newGame(trip), drawn: false });
    expect(latestTrip(storage)).toEqual({ versionOrdinal: 2, trip });
  });
});

describe("one save per trip", () => {
  const other: LinkedTrip = { start: "0136", destination: "0488", mode: { kind: "standard" } };
  const played = (on: LinkedTrip) => ({
    ...newGame(on, freePlayRules(on.mode)),
    guesses: ["0128"],
  });

  test("another trip's save leaves this one, which its link resumes as it was", () => {
    const storage = memoryStorage();
    saveTrip(storage, { versionOrdinal: 2, trip, game: played(trip), drawn: false });
    saveTrip(storage, { versionOrdinal: 2, trip: other, game: newGame(other), drawn: true });

    expect(latestTrip(storage)).toEqual({ versionOrdinal: 2, trip: other });
    expect(resumeTrip(storage, version, trip)).toEqual({ game: played(trip), drawn: false });
    expect(resumeTrip(storage, version, other)?.drawn).toBe(true);
  });

  test("saving the same trip again replaces its save", () => {
    const storage = memoryStorage();
    saveTrip(storage, { versionOrdinal: 2, trip, game: played(trip), drawn: true });
    const fresh = newGame(trip, freePlayRules(trip.mode));
    saveTrip(storage, { versionOrdinal: 2, trip, game: fresh, drawn: false });

    expect(resumeTrip(storage, version, trip)).toEqual({ game: fresh, drawn: false });
  });

  test("the same pair on another version, or in another mode, has a save of its own", () => {
    const storage = memoryStorage();
    const unlimited: LinkedTrip = { ...trip, mode: { kind: "unlimited" } };
    saveTrip(storage, { versionOrdinal: 2, trip, game: played(trip), drawn: false });
    saveTrip(storage, { versionOrdinal: 1, trip, game: newGame(trip), drawn: false });
    saveTrip(storage, {
      versionOrdinal: 2,
      trip: unlimited,
      game: newGame(unlimited),
      drawn: false,
    });

    expect(resumeTrip(storage, version, trip)?.game.guesses).toEqual(["0128"]);
    expect(resumeTrip(storage, version, unlimited)?.game.guesses).toEqual([]);
  });

  test("resuming a trip makes it the most recently played", () => {
    const storage = memoryStorage();
    saveTrip(storage, { versionOrdinal: 2, trip, game: newGame(trip), drawn: false });
    saveTrip(storage, { versionOrdinal: 2, trip: other, game: newGame(other), drawn: false });
    resumeTrip(storage, version, trip);

    expect(latestTrip(storage)).toEqual({ versionOrdinal: 2, trip });
  });

  describe("past the cap of 100", () => {
    // Distinct trips by their version: the same trip on version 1 to 101.
    const saveOn = (storage: KeyValueStorage, ordinal: number) =>
      saveTrip(storage, { versionOrdinal: ordinal, trip, game: newGame(trip), drawn: false });
    const isKept = (storage: KeyValueStorage, ordinal: number) =>
      resumeTrip(storage, { graph, ordinal }, trip) !== undefined;

    test("the 101st trip drops the least recently played, keeping 100", () => {
      const storage = memoryStorage();
      for (let ordinal = 1; ordinal <= 101; ordinal++) saveOn(storage, ordinal);

      expect(JSON.parse(storage.getItem("akle:free-play-trips") ?? "").saves).toHaveLength(100);
      expect(isKept(storage, 1)).toBe(false);
      expect(isKept(storage, 2)).toBe(true);
      expect(isKept(storage, 101)).toBe(true);
    });

    test("reopening a save protects it from being the next dropped", () => {
      const storage = memoryStorage();
      for (let ordinal = 1; ordinal <= 100; ordinal++) saveOn(storage, ordinal);
      // Reopening the oldest makes the second oldest the next to go.
      expect(isKept(storage, 1)).toBe(true);
      saveOn(storage, 101);

      expect(isKept(storage, 2)).toBe(false);
      expect(isKept(storage, 1)).toBe(true);
    });
  });
});

describe("trip saves from before the upgrade", () => {
  const slot = { format: 1, versionOrdinal: 2, trip, drawn: true, game: { guesses: ["0136"] } };

  test("a readable old slot becomes the most recently played save, and the old key goes", () => {
    const storage = memoryStorage();
    storage.setItem("akle:free-play-trip", JSON.stringify(slot));

    expect(latestTrip(storage)).toEqual({ versionOrdinal: 2, trip });
    expect(resumeTrip(storage, version, trip)).toEqual({
      game: { ...newGame(trip, freePlayRules(trip.mode)), guesses: ["0136"] },
      drawn: true,
    });
    expect(storage.getItem("akle:free-play-trip")).toBeNull();
  });

  test("the old slot stays while full storage keeps its save from being written", () => {
    const stored = memoryStorage();
    stored.setItem("akle:free-play-trip", JSON.stringify(slot));
    const full: KeyValueStorage = {
      ...stored,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };

    expect(latestTrip(full)).toEqual({ versionOrdinal: 2, trip });
    expect(stored.getItem("akle:free-play-trip")).not.toBeNull();
  });

  test("the old slot is read only once, never over saves made since", () => {
    const storage = memoryStorage();
    storage.setItem("akle:free-play-trip", JSON.stringify(slot));
    const other: LinkedTrip = { ...trip, start: "0136" };
    saveTrip(storage, { versionOrdinal: 2, trip: other, game: newGame(other), drawn: false });

    expect(latestTrip(storage)).toEqual({ versionOrdinal: 2, trip: other });
    expect(resumeTrip(storage, version, trip)?.drawn).toBe(true);
  });

  test.each([
    ["no JSON", "{not json"],
    ["an unknown format", JSON.stringify({ ...slot, format: 2 })],
    ["no format", JSON.stringify({ ...slot, format: undefined })],
    [
      "a trip without a mode",
      JSON.stringify({ ...slot, trip: { start: "0192", destination: "0488" } }),
    ],
    ["no guesses", JSON.stringify({ ...slot, game: {} })],
    ["a list", "[]"],
  ])("an old slot with %s is dropped quietly", (_, text) => {
    const storage = memoryStorage();
    storage.setItem("akle:free-play-trip", text);

    expect(latestTrip(storage)).toBeUndefined();
    expect(resumeTrip(storage, version, trip)).toBeUndefined();
    expect(storage.getItem("akle:free-play-trip")).toBeNull();
  });
});
