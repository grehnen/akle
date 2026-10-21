import { readCsv } from "../data/csv";
import type { KommunCode } from "../graph/graphVersion";

/** One schedule row (ADR 0001): the daily puzzle for a puzzle number. */
export type ScheduledPuzzle = {
  number: number;
  start: KommunCode;
  destination: KommunCode;
  /** Shortest-route length when the row was generated. */
  n: number;
};

/**
 * Puzzles a kommun must wait before it can be an endpoint again: `cooldownDays` (30 unless
 * set), or the graph version's own entry in `cooldownDaysByGraphVersion`.
 */
export type Cooldown = {
  cooldownDays: number;
  cooldownDaysByGraphVersion?: Readonly<Record<string, number>>;
};

export type ScheduleConfig = Required<Cooldown> & {
  /** Launch day, puzzle #1, as "YYYY-MM-DD". */
  epoch: string;
  seed: string;
};

export const defaultCooldownDays = 30;

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
  return readCsv(csv, scheduleHeader, "Schedule chunk", ([number, start, destination, n]) => {
    const row = { number: Number(number), start, destination, n: Number(n) };
    if (!Number.isInteger(row.number) || !Number.isInteger(row.n)) {
      throw new Error("puzzle and n must be whole numbers");
    }
    return row;
  });
}

export type ScheduleChunkFile = { fileName: string; csv: string };

/** Writes rows, sorted by puzzle number, as one CSV per chunk that holds any of them. */
export function formatScheduleChunks(rows: readonly ScheduledPuzzle[]): ScheduleChunkFile[] {
  const chunks = new Map<number, string[]>();
  for (const row of [...rows].sort((a, b) => a.number - b.number)) {
    const chunk = scheduleChunkFor(row.number);
    const lines = chunks.get(chunk) ?? [scheduleHeader];
    lines.push(`${row.number},${row.start},${row.destination},${row.n}`);
    chunks.set(chunk, lines);
  }
  return [...chunks].map(([chunk, lines]) => ({
    fileName: scheduleChunkFileName(chunk),
    csv: `${lines.join("\n")}\n`,
  }));
}

export function findScheduledPuzzle(
  rows: readonly ScheduledPuzzle[],
  puzzleNumber: number,
): ScheduledPuzzle | undefined {
  return rows.find((row) => row.number === puzzleNumber);
}

export function cooldownDaysOn(cooldown: Cooldown, graphVersionId: string): number {
  return cooldown.cooldownDaysByGraphVersion?.[graphVersionId] ?? cooldown.cooldownDays;
}

export function parseScheduleConfig(json: unknown): ScheduleConfig {
  const config = json as Partial<ScheduleConfig>;
  if (typeof config?.epoch !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(config.epoch)) {
    throw new Error("Schedule config needs an epoch as YYYY-MM-DD");
  }
  if (typeof config.seed !== "string") {
    throw new Error("Schedule config needs a seed string");
  }
  const cooldownDays = config.cooldownDays ?? defaultCooldownDays;
  if (!isWholeDays(cooldownDays)) {
    throw new Error("Schedule config cooldownDays must be a whole number of days");
  }
  const cooldownDaysByGraphVersion = config.cooldownDaysByGraphVersion ?? {};
  if (
    typeof cooldownDaysByGraphVersion !== "object" ||
    !Object.values(cooldownDaysByGraphVersion).every(isWholeDays)
  ) {
    throw new Error(
      "Schedule config cooldownDaysByGraphVersion must map graph version ids to whole numbers of days",
    );
  }
  return { epoch: config.epoch, seed: config.seed, cooldownDays, cooldownDaysByGraphVersion };
}

function isWholeDays(days: unknown): boolean {
  return Number.isInteger(days) && (days as number) >= 0;
}
