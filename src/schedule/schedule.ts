import { readCsv } from "../data/csv";
import type { Trip } from "../engine/game";

/** One schedule row (ADR 0001): the daily trip for a trip number. */
export type ScheduledTrip = Trip & {
  /** Shortest-route length when the row was generated. */
  n: number;
};

/**
 * Trips a kommun must wait before it can be an endpoint again: the graph version's own entry
 * in `cooldownDaysByGraphVersion`, else `cooldownDays`. Likewise, trips before any kommun in
 * the same län can be an endpoint again: `lanCooldownDaysByGraphVersion`, else
 * `lanCooldownDays`, else none. (`parseScheduleConfig` defaults `cooldownDays` to
 * `defaultCooldownDays` and `lanCooldownDays` to `defaultLanCooldownDays`.)
 */
export type Cooldown = {
  cooldownDays: number;
  cooldownDaysByGraphVersion?: Readonly<Record<string, number>>;
  lanCooldownDays?: number;
  lanCooldownDaysByGraphVersion?: Readonly<Record<string, number>>;
};

export type ScheduleConfig = Required<Cooldown> & {
  /** Launch day, trip #1, as "YYYY-MM-DD". */
  epoch: string;
  seed: string;
};

export const defaultCooldownDays = 30;
export const defaultLanCooldownDays = 3;

export const tripsPerChunk = 1000;
export const scheduleHeader = "trip,start,destination,n";

/** The 1-based chunk (`data/schedule/0001.csv` is chunk 1) holding a trip number. */
export function scheduleChunkFor(tripNumber: number): number {
  return Math.ceil(tripNumber / tripsPerChunk);
}

export function scheduleChunkFileName(chunk: number): string {
  return `${String(chunk).padStart(4, "0")}.csv`;
}

export function parseScheduleChunk(csv: string): ScheduledTrip[] {
  return readCsv(csv, scheduleHeader, "Schedule chunk", ([number, start, destination, n]) => {
    const row = { number: Number(number), start, destination, n: Number(n) };
    if (!Number.isInteger(row.number) || !Number.isInteger(row.n)) {
      throw new Error("trip and n must be whole numbers");
    }
    return row;
  });
}

export type ScheduleChunkFile = { fileName: string; csv: string };

/** Writes rows, sorted by trip number, as one CSV per chunk that holds any of them. */
export function formatScheduleChunks(rows: readonly ScheduledTrip[]): ScheduleChunkFile[] {
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

export function findScheduledTrip(
  rows: readonly ScheduledTrip[],
  tripNumber: number,
): ScheduledTrip | undefined {
  return rows.find((row) => row.number === tripNumber);
}

export function cooldownDaysOn(cooldown: Cooldown, graphVersionId: string): number {
  return cooldown.cooldownDaysByGraphVersion?.[graphVersionId] ?? cooldown.cooldownDays;
}

export function lanCooldownDaysOn(cooldown: Cooldown, graphVersionId: string): number {
  return cooldown.lanCooldownDaysByGraphVersion?.[graphVersionId] ?? cooldown.lanCooldownDays ?? 0;
}

/** Checks the `…ByGraphVersion` cooldowns against `graphVersionIds` too, when given. */
export function parseScheduleConfig(
  json: unknown,
  { graphVersionIds }: { graphVersionIds?: readonly string[] } = {},
): ScheduleConfig {
  const config = json as Partial<ScheduleConfig>;
  if (typeof config?.epoch !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(config.epoch)) {
    throw new Error("Schedule config needs an epoch as YYYY-MM-DD");
  }
  if (typeof config.seed !== "string") {
    throw new Error("Schedule config needs a seed string");
  }
  return {
    epoch: config.epoch,
    seed: config.seed,
    cooldownDays: parseDays("cooldownDays", config.cooldownDays, defaultCooldownDays),
    cooldownDaysByGraphVersion: parseDaysByGraphVersion(
      "cooldownDaysByGraphVersion",
      config.cooldownDaysByGraphVersion,
      graphVersionIds,
    ),
    lanCooldownDays: parseDays("lanCooldownDays", config.lanCooldownDays, defaultLanCooldownDays),
    lanCooldownDaysByGraphVersion: parseDaysByGraphVersion(
      "lanCooldownDaysByGraphVersion",
      config.lanCooldownDaysByGraphVersion,
      graphVersionIds,
    ),
  };
}

function parseDays(key: string, value: unknown, defaultDays: number): number {
  const days = value ?? defaultDays;
  if (!isWholeDays(days)) {
    throw new Error(`Schedule config ${key} must be a whole number of days`);
  }
  return days as number;
}

function parseDaysByGraphVersion(
  key: string,
  value: unknown,
  graphVersionIds: readonly string[] | undefined,
): Record<string, number> {
  const daysByGraphVersion = value === undefined ? {} : value;
  if (!isPlainObject(daysByGraphVersion) || !Object.values(daysByGraphVersion).every(isWholeDays)) {
    throw new Error(`Schedule config ${key} must map graph version ids to whole numbers of days`);
  }
  const unknownIds = Object.keys(daysByGraphVersion).filter(
    (id) => graphVersionIds !== undefined && !graphVersionIds.includes(id),
  );
  if (unknownIds.length > 0) {
    throw new Error(
      `Schedule config ${key} names graph versions that don't exist: ${unknownIds.join(", ")}`,
    );
  }
  return daysByGraphVersion as Record<string, number>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWholeDays(days: unknown): boolean {
  return Number.isInteger(days) && (days as number) >= 0;
}
