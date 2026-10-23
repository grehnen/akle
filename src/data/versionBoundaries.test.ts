import { describe, expect, test } from "bun:test";
import { loadDailyPuzzle } from "../daily/loadDailyPuzzle";
import { committedDataSource } from "./committedDataSource";

/** Records which graph versions the app fetches. */
function recordingSource() {
  const fetched: string[] = [];
  const source = {
    ...committedDataSource,
    graphVersionFiles: async (id: string) => {
      fetched.push(id);
      return committedDataSource.graphVersionFiles(id);
    },
  };
  return { source, fetched };
}

const config = await committedDataSource.scheduleConfig();
const versions = [...(await committedDataSource.graphVersions())].sort(
  (a, b) => a.startsAtPuzzle - b.startsAtPuzzle,
);
const boundaries = versions.slice(1).map((version, index) => ({
  before: versions[index].id,
  after: version.id,
  puzzle: version.startsAtPuzzle,
}));

/** Local noon on the day of a puzzle number. */
function dayOf(puzzleNumber: number): Date {
  const [year, month, day] = config.epoch.split("-").map(Number);
  return new Date(year, month - 1, day + puzzleNumber - 1, 12);
}

describe("graph version boundaries in the committed data", () => {
  test("puzzle #1 loads the first graph version", async () => {
    const { source, fetched } = recordingSource();
    const daily = await loadDailyPuzzle(source, dayOf(1));
    expect(daily.kind === "puzzle" && daily.puzzle.number).toBe(1);
    expect(fetched).toEqual([versions[0].id]);
  });

  test.skipIf(boundaries.length === 0).each(boundaries)(
    "puzzle #$puzzle loads $after and the puzzle before it loads $before",
    async ({ before, after, puzzle }) => {
      for (const [puzzleNumber, expected] of [
        [puzzle - 1, before],
        [puzzle, after],
      ] as const) {
        const { source, fetched } = recordingSource();
        const daily = await loadDailyPuzzle(source, dayOf(puzzleNumber));
        if (daily.kind !== "puzzle") {
          throw new Error(
            `Puzzle #${puzzleNumber} is not in the schedule; run bun run schedule so it covers every version's start`,
          );
        }
        expect({ puzzle: daily.puzzle.number, graph: daily.graph.id, fetched }).toEqual({
          puzzle: puzzleNumber,
          graph: expected,
          fetched: [expected],
        });
      }
    },
  );
});
