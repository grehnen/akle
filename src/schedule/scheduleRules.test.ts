import { describe, expect, test } from "bun:test";
import type { ScheduledPuzzle } from "./schedule";
import { checkScheduleRules } from "./scheduleRules";
import { pathGraph } from "./testGraphs";

const row = (number: number, start: string, destination: string, n: number): ScheduledPuzzle => ({
  number,
  start,
  destination,
  n,
});

const graph = pathGraph(14);
const validRows = [row(1, "k00", "k04", 3), row(2, "k05", "k09", 3), row(3, "k01", "k06", 4)];
const check = (
  rows: ScheduledPuzzle[],
  options: { previousRows?: ScheduledPuzzle[]; playedThrough?: number } = {},
) =>
  checkScheduleRules({
    rows,
    previousRows: options.previousRows ?? [],
    graphs: [graph],
    cooldownDays: 2,
    playedThrough: options.playedThrough ?? 0,
  });

describe("checkScheduleRules", () => {
  test("accepts a schedule that follows every rule", () => {
    expect(check(validRows)).toEqual([]);
  });

  test("rejects an N that differs from the row's graph version", () => {
    expect(check([row(1, "k00", "k04", 4)])).toEqual([
      "Puzzle #1: N is 4 but graph version path gives 3",
    ]);
  });

  test("rejects an N outside 3–8", () => {
    expect(check([row(1, "k00", "k03", 2), row(2, "k04", "k13", 8)])).toEqual([
      "Puzzle #1: N is 2, outside 3–8",
    ]);
  });

  test("rejects an endpoint missing from the row's graph version", () => {
    expect(check([row(1, "k00", "x99", 3)])).toEqual([
      "Puzzle #1: x99 is not a kommun in graph version path",
    ]);
  });

  test("rejects a row that no graph version covers", () => {
    const lateGraph = pathGraph(14, "late", 5);
    expect(
      checkScheduleRules({
        rows: [row(1, "k00", "k04", 3)],
        previousRows: [],
        graphs: [lateGraph],
        cooldownDays: 2,
        playedThrough: 0,
      }),
    ).toEqual(["Puzzle #1: no graph version covers it"]);
  });

  test("rejects an endpoint used again within the cooldown", () => {
    expect(check([...validRows, row(4, "k06", "k10", 3)])).toEqual([
      "Puzzle #4: k06 was an endpoint within the last 2 puzzles",
    ]);
    expect(check([...validRows, row(4, "k04", "k08", 3)])).toEqual([]);
  });

  test("holds each row to the cooldown of its own graph version", () => {
    const rows = [row(1, "k00", "k04", 3), row(2, "k00", "k05", 4), row(3, "k00", "k06", 5)];
    expect(
      checkScheduleRules({
        rows,
        previousRows: [],
        graphs: [pathGraph(14, "fixture", 1), pathGraph(14, "real", 3)],
        cooldownDays: 2,
        cooldownDaysByGraphVersion: { fixture: 0 },
        playedThrough: 0,
      }),
    ).toEqual(["Puzzle #3: k00 was an endpoint within the last 2 puzzles"]);
  });

  test("rejects a pair that repeats before every pair with its N is used", () => {
    expect(check([...validRows, row(4, "k04", "k00", 3)])).toEqual([
      "Puzzle #4: k00-k04 repeats (used 1 times) before every N 3 pair is used as often",
    ]);
  });

  test("lets a pair repeat once every pair with its N is used", () => {
    // On a line of five kommuner, k00–k04 is the only pair with N 3.
    const shortGraph = pathGraph(5);
    const rows = [row(1, "k00", "k04", 3), row(2, "k04", "k00", 3)];
    expect(
      checkScheduleRules({
        rows,
        previousRows: [],
        graphs: [shortGraph],
        cooldownDays: 0,
        playedThrough: 0,
      }),
    ).toEqual([]);
  });

  test("rejects puzzle numbers that skip, repeat or do not start at 1", () => {
    expect(check([row(1, "k00", "k04", 3), row(3, "k05", "k09", 3)])).toEqual([
      "Puzzle numbers must run 1, 2, 3, …: expected #2, got #3",
    ]);
    expect(check([row(2, "k00", "k04", 3)])).toEqual([
      "Puzzle numbers must run 1, 2, 3, …: expected #1, got #2",
    ]);
  });

  test("rejects a played row that was changed or removed", () => {
    const changed = [validRows[0], row(2, "k07", "k11", 3), validRows[2]];
    expect(check(changed, { previousRows: validRows, playedThrough: 2 })).toEqual([
      "Puzzle #2 is played and must not change: was k05,k09,3, now k07,k11,3",
    ]);
    expect(check(validRows.slice(0, 1), { previousRows: validRows, playedThrough: 2 })).toEqual([
      "Puzzle #2 is played and must not change: was k05,k09,3, now missing",
    ]);
  });

  test("lets unplayed rows change, and does not hold played rows to the other rules", () => {
    const grandfathered = [
      row(1, "k00", "k04", 3),
      row(2, "k00", "k04", 3),
      row(3, "k05", "k09", 3),
    ];
    expect(check(grandfathered, { previousRows: grandfathered, playedThrough: 2 })).toEqual([]);
    expect(check(validRows, { previousRows: grandfathered, playedThrough: 2 })).toEqual([
      "Puzzle #2 is played and must not change: was k00,k04,3, now k05,k09,3",
    ]);
  });
});
