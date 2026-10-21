const millisecondsPerDay = 24 * 60 * 60 * 1000;

/**
 * The puzzle number for the player's local calendar day: days since the epoch, + 1.
 * `epoch` is the launch day as "YYYY-MM-DD". Results below 1 mean the clock is before launch.
 */
export function puzzleNumberOn(now: Date, epoch: string): number {
  return puzzleNumberOnDay(now.getFullYear(), now.getMonth(), now.getDate(), epoch);
}

const earliestTimeZoneOffsetMilliseconds = 14 * 60 * 60 * 1000;

/**
 * The highest puzzle number anyone could have opened: today's number in UTC+14, the earliest
 * time zone. Rows up to this number count as played and never change. 0 before the epoch.
 */
export function latestPlayedPuzzleNumber(now: Date, epoch: string): number {
  const earliest = new Date(now.getTime() + earliestTimeZoneOffsetMilliseconds);
  return Math.max(
    0,
    puzzleNumberOnDay(
      earliest.getUTCFullYear(),
      earliest.getUTCMonth(),
      earliest.getUTCDate(),
      epoch,
    ),
  );
}

/**
 * The played puzzle number the checks compare with a base revision at: a puzzle only counts as
 * played if the base scheduled it, so this is capped by the base's last scheduled puzzle, and is
 * 0 when the base has no schedule (bootstrapping the data).
 */
export function playedThroughAtBase(
  now: Date,
  epoch: string,
  baseRows: readonly { number: number }[],
): number {
  const lastScheduledAtBase = baseRows.reduce((last, row) => Math.max(last, row.number), 0);
  return Math.min(latestPlayedPuzzleNumber(now, epoch), lastScheduledAtBase);
}

/** The puzzle number of a calendar day; `month` is 0-based, as in `Date`. */
function puzzleNumberOnDay(year: number, month: number, day: number, epoch: string): number {
  const [epochYear, epochMonth, epochDay] = parseIsoDate(epoch);
  const days = Date.UTC(year, month, day) - Date.UTC(epochYear, epochMonth - 1, epochDay);
  return Math.round(days / millisecondsPerDay) + 1;
}

function parseIsoDate(date: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Expected a YYYY-MM-DD date, got "${date}"`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}
