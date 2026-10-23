import { createHash } from "node:crypto";
import type { GraphVersion } from "../graph/graphVersion";
import { graphVersionFor } from "../graph/graphVersionFiles";
import { shortestRouteLengthsFrom } from "../graph/routes";
import { type Cooldown, puzzlesPerChunk, type ScheduledPuzzle } from "./schedule";
import { pairEndpoints } from "../graph/kommunPair";
import { maximumN, minimumN, pairsByN, ScheduleHistory } from "./scheduleHistory";

export type GenerateScheduleInput = Cooldown & {
  /** The committed schedule, in puzzle order. */
  rows: readonly ScheduledPuzzle[];
  graphs: readonly GraphVersion[];
  seed: string;
  /** Rows up to this puzzle number are played and copied unchanged. */
  playedThrough: number;
  /** How many chunks to complete or add after the last row; 0 only reconciles. */
  chunks: number;
};

export type ReconciledRow = { before: ScheduledPuzzle; after: ScheduledPuzzle };

export type GeneratedSchedule = {
  rows: ScheduledPuzzle[];
  /** Unplayed rows whose N was updated or whose pair was replaced. */
  reconciled: ReconciledRow[];
  added: ScheduledPuzzle[];
};

const maximumAttempts = 1000;

/**
 * `bun run schedule` (ADR 0001): reconciles unplayed rows against their graph versions,
 * then appends chunks. The committed rows are the only state, and each row's draws come
 * from hash(seed, puzzle number, attempt), so the same inputs always give the same output.
 */
export function generateSchedule(input: GenerateScheduleInput): GeneratedSchedule {
  const history = new ScheduleHistory(input);
  const rows: ScheduledPuzzle[] = [];
  const reconciled: ReconciledRow[] = [];
  const added: ScheduledPuzzle[] = [];
  const graphFor = (puzzleNumber: number) => {
    const graph = graphVersionFor(input.graphs, puzzleNumber);
    if (!graph) throw new Error(`No graph version covers puzzle #${puzzleNumber}`);
    return graph;
  };
  const keep = (row: ScheduledPuzzle) => {
    rows.push(row);
    history.add(row);
  };

  for (const row of input.rows) {
    if (row.number <= input.playedThrough) {
      keep(row);
      continue;
    }
    const graph = graphFor(row.number);
    const updated = withCurrentN(row, graph);
    const after =
      history.violations(updated, graph).length === 0
        ? updated
        : drawRow(row.number, graph, history, input.seed);
    if (!sameRow(row, after)) reconciled.push({ before: row, after });
    keep(after);
  }

  const lastNumber = input.rows.at(-1)?.number ?? 0;
  const target = scheduleEndAfter(lastNumber, input.chunks);
  for (let number = lastNumber + 1; number <= target; number++) {
    const row = drawRow(number, graphFor(number), history, input.seed);
    added.push(row);
    keep(row);
  }
  return { rows, reconciled, added };
}

/** The last puzzle number once `chunks` chunks are completed or added after `lastNumber`. */
function scheduleEndAfter(lastNumber: number, chunks: number): number {
  if (chunks === 0) return lastNumber;
  const partialChunkStart = Math.floor(lastNumber / puzzlesPerChunk) * puzzlesPerChunk;
  return partialChunkStart + chunks * puzzlesPerChunk;
}

function withCurrentN(row: ScheduledPuzzle, graph: GraphVersion): ScheduledPuzzle {
  if (!graph.kommuner.has(row.start) || !graph.kommuner.has(row.destination)) return row;
  const n = shortestRouteLengthsFrom(graph, row.start).get(row.destination);
  return n === undefined ? row : { ...row, n };
}

function sameRow(a: ScheduledPuzzle, b: ScheduledPuzzle): boolean {
  return a.start === b.start && a.destination === b.destination && a.n === b.n;
}

/**
 * Draws N uniformly from 3–8, then a pair uniformly among the least-used pairs with that N
 * whose endpoints are outside the kommun and län cooldowns. Redraws with the next attempt
 * when none qualifies.
 */
function drawRow(
  puzzleNumber: number,
  graph: GraphVersion,
  history: ScheduleHistory,
  seed: string,
): ScheduledPuzzle {
  const groups = pairsByN(graph);
  for (let attempt = 0; attempt < maximumAttempts; attempt++) {
    const random = randomNumbers(seed, puzzleNumber, attempt);
    const n = minimumN + Number(random.next() % BigInt(maximumN - minimumN + 1));
    const candidates = history
      .leastUsed(groups.get(n) ?? [])
      .filter((key) =>
        pairEndpoints(key).every((code) => history.isAvailable(code, puzzleNumber, graph)),
      );
    if (candidates.length === 0) continue;
    const [a, b] = pairEndpoints(candidates[Number(random.next() % BigInt(candidates.length))]);
    const swap = random.next() % 2n === 1n;
    return { number: puzzleNumber, start: swap ? b : a, destination: swap ? a : b, n };
  }
  throw new Error(
    `No pair qualifies for puzzle #${puzzleNumber} on graph version ${graph.id} after ${maximumAttempts} attempts; is a cooldown too long for the graph?`,
  );
}

/** Successive 64-bit numbers from sha256("seed:puzzleNumber:attempt"). Changing this changes every future draw. */
function randomNumbers(seed: string, puzzleNumber: number, attempt: number) {
  const digest = createHash("sha256").update(`${seed}:${puzzleNumber}:${attempt}`).digest();
  let offset = 0;
  return {
    next(): bigint {
      const value = digest.readBigUInt64BE(offset);
      offset += 8;
      return value;
    },
  };
}
