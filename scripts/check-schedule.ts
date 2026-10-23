// bun run schedule:check [--base <git revision>] [--now <ISO date>]
// The schedule rules check (ADR 0001). Played rows (data/README.md) are compared with the base
// revision (HEAD by default).
import { checkScheduleRules } from "../src/schedule/scheduleRules";
import {
  checkArguments,
  readGraphVersions,
  readScheduleConfig,
  readScheduleRows,
  readScheduleRowsAt,
} from "./scheduleData";
import { playedThroughAtBase } from "./playedThrough";

const { base, now } = checkArguments();

const config = await readScheduleConfig();
const rows = await readScheduleRows();
const previousRows = readScheduleRowsAt(base);
const playedThrough = playedThroughAtBase(now, config.epoch, previousRows);
const violations = checkScheduleRules({
  rows,
  previousRows,
  graphs: await readGraphVersions(),
  cooldownDays: config.cooldownDays,
  cooldownDaysByGraphVersion: config.cooldownDaysByGraphVersion,
  lanCooldownDays: config.lanCooldownDays,
  lanCooldownDaysByGraphVersion: config.lanCooldownDaysByGraphVersion,
  playedThrough,
});

if (violations.length > 0) {
  console.error(`Schedule rules check failed (${violations.length}):`);
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}
console.log(
  `Schedule rules check passed: ${rows.length} puzzles, played through #${playedThrough}, compared with ${base}.`,
);
