// bun run schedule:check [--base <git revision>] [--now <ISO date>]
// The schedule rules check (ADR 0001). Played rows are compared with the base revision (HEAD by default).
import { latestPlayedPuzzleNumber } from "../src/daily/puzzleNumber";
import { defaultCooldownDays } from "../src/schedule/schedule";
import { checkScheduleRules } from "../src/schedule/scheduleRules";
import {
  argument,
  readGraphVersions,
  readScheduleConfig,
  readScheduleRows,
  readScheduleRowsAt,
} from "./scheduleData";

// A push that creates a branch has no previous revision: GitHub sends all zeros.
const requestedBase = argument("base") ?? "";
const base = requestedBase === "" || /^0+$/.test(requestedBase) ? "HEAD" : requestedBase;
const now = new Date(argument("now") ?? Date.now());

const config = await readScheduleConfig();
const rows = await readScheduleRows();
const playedThrough = latestPlayedPuzzleNumber(now, config.epoch);
const violations = checkScheduleRules({
  rows,
  previousRows: readScheduleRowsAt(base),
  graphs: await readGraphVersions(),
  cooldownDays: config.cooldownDays ?? defaultCooldownDays,
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
