// bun run schedule:check [--base <git revision>] [--now <ISO date>]
// The schedule rules check (ADR 0001). Played rows are compared with the base revision (HEAD by default).
import { latestPlayedPuzzleNumber } from "../src/daily/puzzleNumber";
import { checkScheduleRules } from "../src/schedule/scheduleRules";
import {
  checkArguments,
  readGraphVersions,
  readScheduleConfig,
  readScheduleRows,
  readScheduleRowsAt,
} from "./scheduleData";

const { base, now } = checkArguments();

const config = await readScheduleConfig();
const rows = await readScheduleRows();
const playedThrough = latestPlayedPuzzleNumber(now, config.epoch);
const violations = checkScheduleRules({
  rows,
  previousRows: readScheduleRowsAt(base),
  graphs: await readGraphVersions(),
  cooldownDays: config.cooldownDays,
  cooldownDaysByGraphVersion: config.cooldownDaysByGraphVersion,
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
