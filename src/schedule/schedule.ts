import type { KommunCode } from "../graph/graphVersion";

/** One schedule row (ADR 0001): the daily puzzle for a puzzle number. */
export type ScheduledPuzzle = {
  number: number;
  start: KommunCode;
  destination: KommunCode;
  /** Shortest-route length when the row was generated. */
  n: number;
};

export type ScheduleConfig = {
  /** Launch day, puzzle #1, as "YYYY-MM-DD". */
  epoch: string;
  seed: string;
};

export const puzzlesPerChunk = 1000;
export const scheduleHeader = "puzzle,start,destination,n";

/** The 1-based chunk (`data/schedule/0001.csv` is chunk 1) holding a puzzle number. */
export function scheduleChunkFor(puzzleNumber: number): number {
  return Math.ceil(puzzleNumber / puzzlesPerChunk);
}

export function scheduleChunkFileName(chunk: number): string {
  return `${String(chunk).padStart(4, "0")}.csv`;
}

export function parseScheduleChunk(csv: string): ScheduledPuzzle[] {
  const lines = csv.split(/\r?\n/);
  if (lines[0] !== scheduleHeader) {
    throw new Error(`Schedule chunk header must be "${scheduleHeader}", got "${lines[0]}"`);
  }
  const rows: ScheduledPuzzle[] = [];
  lines.slice(1).forEach((line, index) => {
    if (line === "") return;
    const fields = line.split(",");
    const [number, start, destination, n] = fields;
    const row = { number: Number(number), start, destination, n: Number(n) };
    if (
      fields.length !== 4 ||
      !Number.isInteger(row.number) ||
      !Number.isInteger(row.n) ||
      !start ||
      !destination
    ) {
      throw new Error(`Malformed schedule row on line ${index + 2}: "${line}"`);
    }
    rows.push(row as ScheduledPuzzle);
  });
  return rows;
}

export function findScheduledPuzzle(
  rows: readonly ScheduledPuzzle[],
  puzzleNumber: number,
): ScheduledPuzzle | undefined {
  return rows.find((row) => row.number === puzzleNumber);
}

export function parseScheduleConfig(json: unknown): ScheduleConfig {
  const config = json as Partial<ScheduleConfig>;
  if (typeof config?.epoch !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(config.epoch)) {
    throw new Error("Schedule config needs an epoch as YYYY-MM-DD");
  }
  if (typeof config.seed !== "string") {
    throw new Error("Schedule config needs a seed string");
  }
  return { epoch: config.epoch, seed: config.seed };
}
