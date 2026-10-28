// bun run schedule:check [--base <git revision>] [--now <ISO date>]
// The schedule rules check (ADR 0001). Played rows (data/README.md) are compared with the base
// revision (HEAD by default), and the epoch may not move once the base has a played trip.
import { checkScheduleRules } from "../src/schedule/scheduleRules";
import {
  checkArguments,
  readGraphVersions,
  readScheduleConfig,
  readScheduleRows,
  readScheduleAt,
} from "./scheduleData";
import { epochChangeViolation, playedThroughAtBase } from "./playedThrough";

const { base, now } = checkArguments();

const config = await readScheduleConfig();
const rows = await readScheduleRows();
const scheduleAtBase = readScheduleAt(base, config.epoch);
const previousRows = scheduleAtBase.rows;
const playedThrough = playedThroughAtBase(now, scheduleAtBase);
const epochViolation = epochChangeViolation({
  baseEpoch: scheduleAtBase.epoch,
  epoch: config.epoch,
  playedThrough,
});
const violations = [
  ...(epochViolation === undefined ? [] : [epochViolation]),
  ...checkScheduleRules({
    rows,
    previousRows,
    graphs: await readGraphVersions(),
    cooldownDays: config.cooldownDays,
    cooldownDaysByGraphVersion: config.cooldownDaysByGraphVersion,
    lanCooldownDays: config.lanCooldownDays,
    lanCooldownDaysByGraphVersion: config.lanCooldownDaysByGraphVersion,
    playedThrough,
  }),
];

if (violations.length > 0) {
  console.error(`Schedule rules check failed (${violations.length}):`);
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}
console.log(
  `Schedule rules check passed: ${rows.length} trips, played through #${playedThrough}, compared with ${base}.`,
);
