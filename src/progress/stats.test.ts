import { describe, expect, test } from "bun:test";
import type { History, HistoryEntry } from "./history";
import { deriveStats } from "./stats";

const win = (extra: number): HistoryEntry => ({
  won: true,
  extra,
  perfect: false,
  hintsUsed: 0,
  emojiLine: "",
});
const perfect: HistoryEntry = { won: true, extra: 0, perfect: true, hintsUsed: 0, emojiLine: "" };
const loss: HistoryEntry = { won: false, extra: null, perfect: false, hintsUsed: 0, emojiLine: "" };

describe("the stats", () => {
  test("count finished games only, so an unfinished puzzle changes neither Spelade nor Vinst %", () => {
    // Puzzle 2 was started but not finished by midnight, so it never reached the history.
    const history: History = { 1: win(1), 3: loss, 4: perfect };
    const stats = deriveStats(history, 5);
    expect(stats.played).toBe(3);
    expect(stats.winPercent).toBe(67);
  });

  test("no games played is 0 %", () => {
    expect(deriveStats({}, 1).winPercent).toBe(0);
  });

  describe("streaks", () => {
    test("count wins on consecutive puzzle numbers up to today", () => {
      const stats = deriveStats({ 3: win(2), 4: perfect, 5: win(0) }, 5);
      expect(stats.currentStreak).toBe(3);
      expect(stats.longestStreak).toBe(3);
    });

    test("a skipped puzzle resets the current streak", () => {
      const stats = deriveStats({ 1: win(1), 2: win(1), 3: win(1), 5: win(0) }, 5);
      expect(stats.currentStreak).toBe(1);
      expect(stats.longestStreak).toBe(3);
    });

    test("a loss resets the current streak", () => {
      const stats = deriveStats({ 1: win(1), 2: win(1), 3: loss, 4: win(0) }, 4);
      expect(stats.currentStreak).toBe(1);
      expect(stats.longestStreak).toBe(2);
    });

    test("losing today ends the streak", () => {
      expect(deriveStats({ 1: win(1), 2: win(1), 3: loss }, 3).currentStreak).toBe(0);
    });

    test("today's puzzle still in play keeps yesterday's streak alive", () => {
      expect(deriveStats({ 1: win(1), 2: win(1) }, 3).currentStreak).toBe(2);
    });

    test("a puzzle left unfinished yesterday ends the streak", () => {
      const stats = deriveStats({ 1: win(1), 2: win(1) }, 4);
      expect(stats.currentStreak).toBe(0);
      expect(stats.longestStreak).toBe(2);
    });
  });

  describe("the distribution", () => {
    test("has fixed rows Perfekt, +0 … +8 and Förlust, counting each finished game once", () => {
      const history: History = { 1: perfect, 2: win(0), 3: win(2), 4: win(2), 5: loss, 6: win(8) };
      expect(
        deriveStats(history, 7).distribution.map(({ label, games }) => [label, games]),
      ).toEqual([
        ["Perfekt", 1],
        ["+0", 1],
        ["+1", 0],
        ["+2", 2],
        ["+3", 0],
        ["+4", 0],
        ["+5", 0],
        ["+6", 0],
        ["+7", 0],
        ["+8", 1],
        ["Förlust", 1],
      ]);
    });

    test("splits each row into games without and with hints; totals and streaks combine both", () => {
      const hinted = (entry: HistoryEntry, hintsUsed: number) => ({ ...entry, hintsUsed });
      const history: History = {
        1: perfect,
        2: win(2),
        3: hinted(win(2), 1),
        4: hinted(win(0), 3),
        5: hinted(loss, 2),
        6: loss,
        7: hinted(win(1), 1),
      };
      const stats = deriveStats(history, 7);
      expect(
        stats.distribution
          .filter((row) => row.games > 0)
          .map(({ label, games, withHints }) => [label, games - withHints, withHints]),
      ).toEqual([
        ["Perfekt", 1, 0],
        ["+0", 0, 1],
        ["+1", 0, 1],
        ["+2", 1, 1],
        ["Förlust", 1, 1],
      ]);
      expect(stats.played).toBe(7);
      expect(stats.winPercent).toBe(71);
      expect(stats.currentStreak).toBe(1);
      expect(stats.longestStreak).toBe(4);
    });

    const todayRows = (history: History, today: number) =>
      deriveStats(history, today)
        .distribution.filter((row) => row.today)
        .map((row) => row.label);

    test("highlights the row of today's result", () => {
      expect(todayRows({ 1: perfect, 2: win(3) }, 2)).toEqual(["+3"]);
      expect(todayRows({ 1: win(3), 2: perfect }, 2)).toEqual(["Perfekt"]);
      expect(todayRows({ 1: win(3), 2: loss }, 2)).toEqual(["Förlust"]);
    });

    test("highlights no row while today's puzzle is unfinished", () => {
      expect(todayRows({ 1: win(3) }, 2)).toEqual([]);
    });
  });
});
