import { describe, expect, test } from "bun:test";
import { latestPlayedPuzzleNumber, playedThroughAtBase, puzzleNumberOn } from "./puzzleNumber";

const epoch = "2026-10-01";

describe("puzzleNumberOn", () => {
  test("the epoch day is puzzle #1 from local midnight to the last second", () => {
    expect(puzzleNumberOn(new Date(2026, 9, 1, 0, 0, 0), epoch)).toBe(1);
    expect(puzzleNumberOn(new Date(2026, 9, 1, 23, 59, 59, 999), epoch)).toBe(1);
  });

  test("the day before the epoch is puzzle #0, which does not exist", () => {
    expect(puzzleNumberOn(new Date(2026, 8, 30, 23, 59, 59, 999), epoch)).toBe(0);
    expect(puzzleNumberOn(new Date(2026, 0, 1, 12, 0), epoch)).toBeLessThan(1);
  });

  test("a new puzzle starts at each local midnight", () => {
    expect(puzzleNumberOn(new Date(2026, 9, 21, 23, 59, 59, 999), epoch)).toBe(21);
    expect(puzzleNumberOn(new Date(2026, 9, 22, 0, 0, 0), epoch)).toBe(22);
  });

  test("counts calendar days across daylight saving changes and years", () => {
    expect(puzzleNumberOn(new Date(2026, 9, 25, 12, 0), epoch)).toBe(25);
    expect(puzzleNumberOn(new Date(2027, 2, 28, 12, 0), epoch)).toBe(179);
    expect(puzzleNumberOn(new Date(2027, 9, 1, 0, 0), epoch)).toBe(366);
  });
});

describe("latestPlayedPuzzleNumber", () => {
  test("is today's puzzle number in UTC+14, the earliest time zone", () => {
    // 09:59 UTC is 23:59 in UTC+14; 10:00 UTC is already the next day there.
    expect(latestPlayedPuzzleNumber(new Date("2026-10-21T09:59:59Z"), epoch)).toBe(21);
    expect(latestPlayedPuzzleNumber(new Date("2026-10-21T10:00:00Z"), epoch)).toBe(22);
  });

  test("is 0 before anyone anywhere has reached the epoch", () => {
    expect(latestPlayedPuzzleNumber(new Date("2026-09-30T09:00:00Z"), epoch)).toBe(0);
    expect(latestPlayedPuzzleNumber(new Date("2026-01-01T00:00:00Z"), epoch)).toBe(0);
  });
});

describe("playedThroughAtBase", () => {
  const now = new Date("2026-10-21T10:00:00Z");

  test("is 0 when the base revision has no schedule", () => {
    expect(playedThroughAtBase(now, epoch, [])).toBe(0);
  });

  test("is capped by the last puzzle the base revision scheduled", () => {
    expect(playedThroughAtBase(now, epoch, [{ number: 1 }, { number: 2 }])).toBe(2);
  });

  test("is the latest played puzzle number when the base scheduled past it", () => {
    const baseRows = Array.from({ length: 90 }, (_, index) => ({ number: index + 1 }));
    expect(playedThroughAtBase(now, epoch, baseRows)).toBe(22);
  });
});
