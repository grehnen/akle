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

function parseIsoDate(date: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Expected a YYYY-MM-DD date, got "${date}"`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}
