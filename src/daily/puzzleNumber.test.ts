import { describe, expect, test } from "bun:test";
import { puzzleNumberOn } from "./puzzleNumber";

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
