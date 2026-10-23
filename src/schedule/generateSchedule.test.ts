import { describe, expect, test } from "bun:test";
import { buildGraphVersion, type GraphVersion, lanOf } from "../graph/graphVersion";
import { generateSchedule } from "./generateSchedule";
import type { ScheduledPuzzle } from "./schedule";
import { checkScheduleRules } from "./scheduleRules";
import { lanPathGraph, pathCode, pathGraph } from "./testGraphs";

const row = (number: number, start: string, destination: string, n: number): ScheduledPuzzle => ({
  number,
  start,
  destination,
  n,
});

const graph = pathGraph(14);

function generate(
  rows: readonly ScheduledPuzzle[],
  options: {
    graphs?: GraphVersion[];
    chunks?: number;
    playedThrough?: number;
    cooldownDays?: number;
  } = {},
) {
  return generateSchedule({
    rows,
    graphs: options.graphs ?? [graph],
    seed: "test",
    cooldownDays: options.cooldownDays ?? 2,
    playedThrough: options.playedThrough ?? 0,
    chunks: options.chunks ?? 1,
  });
}

describe("generateSchedule", () => {
  test("appends a 1,000-puzzle chunk that passes the schedule rules check", () => {
    const { rows } = generate([]);
    expect(rows.map((generated) => generated.number)).toEqual(
      Array.from({ length: 1000 }, (_, i) => i + 1),
    );
    expect(
      checkScheduleRules({
        rows,
        previousRows: [],
        graphs: [graph],
        cooldownDays: 2,
        playedThrough: 0,
      }),
    ).toEqual([]);
  });

  test("gives the same rows for the same inputs, and an extension never changes earlier draws", () => {
    const oneChunk = generate([]).rows;
    expect(generate([]).rows).toEqual(oneChunk);
    const extended = generate(oneChunk).rows;
    expect(extended).toHaveLength(2000);
    expect(extended.slice(0, 1000)).toEqual(oneChunk);
    expect(generate([], { chunks: 2 }).rows).toEqual(extended);
  });

  test("a different seed gives a different schedule", () => {
    const other = generateSchedule({
      rows: [],
      graphs: [graph],
      seed: "other",
      cooldownDays: 2,
      playedThrough: 0,
      chunks: 1,
    });
    expect(other.rows).not.toEqual(generate([]).rows);
  });

  test("completes a partly filled chunk, and only reconciles with 0 chunks", () => {
    const start = generate([]).rows.slice(0, 90);
    const completed = generate(start);
    expect(completed.rows).toHaveLength(1000);
    expect(completed.rows.slice(0, 90)).toEqual(start);
    expect(completed.added.map((added) => added.number)).toEqual(
      Array.from({ length: 910 }, (_, i) => i + 91),
    );
    expect(generate(start, { chunks: 0 })).toEqual({ rows: start, reconciled: [], added: [] });
  });

  describe("reconciles unplayed rows against their own graph version", () => {
    // From puzzle #3 the line gets a shortcut k03–k05 and loses k13.
    const before = pathGraph(14, "before", 1);
    const after = buildGraphVersion({
      id: "after",
      startsAtPuzzle: 3,
      kommuner: Array.from({ length: 13 }, (_, i) => ({ code: pathCode(i), name: pathCode(i) })),
      links: [
        ...Array.from({ length: 12 }, (_, i) => ({
          between: [pathCode(i), pathCode(i + 1)] as const,
          kind: "land" as const,
        })),
        { between: ["k03", "k05"], kind: "fixed" },
      ],
    });
    const committed = [
      row(1, "k02", "k06", 3),
      row(2, "k01", "k06", 4),
      row(3, "k00", "k06", 5),
      row(4, "k01", "k05", 3),
      row(5, "k09", "k13", 3),
      row(6, "k04", "k08", 3),
    ];
    const result = generate(committed, {
      graphs: [before, after],
      cooldownDays: 0,
      playedThrough: 1,
      chunks: 0,
    });

    test("updates N when the route got shorter but stays within 3–8", () => {
      expect(result.rows[2]).toEqual(row(3, "k00", "k06", 4));
    });

    test("replaces the pair when N leaves 3–8 or an endpoint no longer exists", () => {
      expect(result.reconciled.map((change) => change.before.number)).toEqual([3, 4, 5]);
      for (const replaced of [result.rows[3], result.rows[4]]) {
        expect(replaced.n).toBeGreaterThanOrEqual(3);
        expect(replaced.n).toBeLessThanOrEqual(8);
        expect([replaced.start, replaced.destination]).not.toContain("k13");
      }
      expect(
        checkScheduleRules({
          rows: result.rows,
          previousRows: committed,
          graphs: [before, after],
          cooldownDays: 0,
          playedThrough: 1,
        }),
      ).toEqual([]);
    });

    test("leaves played rows and still-valid rows alone", () => {
      expect(result.rows[0]).toEqual(committed[0]);
      expect(result.rows[1]).toEqual(committed[1]);
      expect(result.rows[5]).toEqual(committed[5]);
    });
  });

  test("draws each row within the cooldown of its own graph version", () => {
    // Six kommuner can't meet a 2-puzzle cooldown, so the first version waives it.
    const fixture = pathGraph(6, "fixture", 1);
    const real = pathGraph(14, "real", 21);
    const cooldown = { cooldownDays: 2, cooldownDaysByGraphVersion: { fixture: 0 } };
    const { rows } = generateSchedule({
      rows: [],
      graphs: [fixture, real],
      seed: "test",
      ...cooldown,
      playedThrough: 0,
      chunks: 1,
    });
    expect(
      checkScheduleRules({
        rows,
        previousRows: [],
        graphs: [fixture, real],
        ...cooldown,
        playedThrough: 0,
      }),
    ).toEqual([]);
  });

  test("keeps endpoints out of a län that had an endpoint within the län cooldown", () => {
    const lanGraph = lanPathGraph(8, 4);
    const cooldown = { cooldownDays: 0, lanCooldownDays: 1 };
    const { rows } = generateSchedule({
      rows: [],
      graphs: [lanGraph],
      seed: "test",
      ...cooldown,
      playedThrough: 0,
      chunks: 1,
    });
    const lans = (puzzle: ScheduledPuzzle) => [puzzle.start, puzzle.destination].map(lanOf);
    for (let i = 1; i < rows.length; i++) {
      expect(lans(rows[i]).some((lan) => lans(rows[i - 1]).includes(lan))).toBe(false);
    }
    expect(
      checkScheduleRules({
        rows,
        previousRows: [],
        graphs: [lanGraph],
        ...cooldown,
        playedThrough: 0,
      }),
    ).toEqual([]);
  });

  describe("least-used refilling", () => {
    // On a line of six kommuner: N 3 has k00–k04 and k01–k05; N 4 has only k00–k05.
    const short = pathGraph(6, "short", 1);
    const pairsWithN = (rows: readonly ScheduledPuzzle[], n: number) =>
      rows
        .filter((generated) => generated.n === n)
        .map((generated) => [generated.start, generated.destination].sort().join("-"));

    test("repeats a pair only after every pair with its N has been used as often", () => {
      const { rows } = generate([], { graphs: [short], cooldownDays: 0 });
      const nThree = pairsWithN(rows, 3);
      expect(nThree.length).toBeGreaterThan(10);
      for (let i = 0; i + 1 < nThree.length; i += 2) {
        expect([nThree[i], nThree[i + 1]].sort()).toEqual(["k00-k04", "k01-k05"]);
      }
      expect(new Set(pairsWithN(rows, 4))).toEqual(new Set(["k00-k05"]));
      expect(rows.every((generated) => generated.n === 3 || generated.n === 4)).toBe(true);
    });

    test("uses the pairs a new graph version adds before repeating older ones", () => {
      const longer = pathGraph(7, "longer", 21);
      const { rows } = generate([], { graphs: [short, longer], cooldownDays: 0 });
      const fromNewVersion = rows.slice(20);
      expect(pairsWithN(fromNewVersion, 3)[0]).toBe("k02-k06");
      expect(pairsWithN(fromNewVersion, 4)[0]).toBe("k01-k06");
      expect(pairsWithN(fromNewVersion, 5)[0]).toBe("k00-k06");
    });
  });
});
