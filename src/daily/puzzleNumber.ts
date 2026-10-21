const millisecondsPerDay = 24 * 60 * 60 * 1000;

/**
 * The puzzle number for the player's local calendar day: days since the epoch, + 1.
 * `epoch` is the launch day as "YYYY-MM-DD". Results below 1 mean the clock is before launch.
 */
export function puzzleNumberOn(now: Date, epoch: string): number {
  const [epochYear, epochMonth, epochDay] = parseIsoDate(epoch);
  const localDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const epochDayUtc = Date.UTC(epochYear, epochMonth - 1, epochDay);
  return Math.round((localDay - epochDayUtc) / millisecondsPerDay) + 1;
}

const earliestTimeZoneOffsetMilliseconds = 14 * 60 * 60 * 1000;

/**
 * The highest puzzle number anyone could have opened: today's number in UTC+14, the earliest
 * time zone. Rows up to this number count as played and never change. 0 before the epoch.
 */
export function latestPlayedPuzzleNumber(now: Date, epoch: string): number {
  const [epochYear, epochMonth, epochDay] = parseIsoDate(epoch);
  const earliest = new Date(now.getTime() + earliestTimeZoneOffsetMilliseconds);
  const earliestDay = Date.UTC(
    earliest.getUTCFullYear(),
    earliest.getUTCMonth(),
    earliest.getUTCDate(),
  );
  const epochDayUtc = Date.UTC(epochYear, epochMonth - 1, epochDay);
  return Math.max(0, Math.round((earliestDay - epochDayUtc) / millisecondsPerDay) + 1);
}

function parseIsoDate(date: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Expected a YYYY-MM-DD date, got "${date}"`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}
