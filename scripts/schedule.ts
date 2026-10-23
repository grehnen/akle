// bun run schedule [--chunks k] [--now <ISO date>]
// Reconciles unplayed rows (data/README.md; HEAD is the base), appends k chunks (default 1) and prints the PR report.
import { generateSchedule } from "../src/schedule/generateSchedule";
import { scheduleReport } from "../src/schedule/scheduleReport";
import {
  argument,
  readGraphVersions,
  readScheduleConfig,
  readScheduleRows,
  readScheduleRowsAt,
  writeScheduleRows,
} from "./scheduleData";
import { playedThroughAtBase } from "./playedThrough";

const chunks = Number(argument("chunks") ?? 1);
if (!Number.isInteger(chunks) || chunks < 0) {
  throw new Error("--chunks needs a whole number of chunks, 0 or more");
}
const now = new Date(argument("now") ?? Date.now());

const config = await readScheduleConfig();
const graphs = await readGraphVersions();
const schedule = generateSchedule({
  rows: await readScheduleRows(),
  graphs,
  seed: config.seed,
  cooldownDays: config.cooldownDays,
  cooldownDaysByGraphVersion: config.cooldownDaysByGraphVersion,
  lanCooldownDays: config.lanCooldownDays,
  lanCooldownDaysByGraphVersion: config.lanCooldownDaysByGraphVersion,
  playedThrough: playedThroughAtBase(now, config.epoch, readScheduleRowsAt("HEAD")),
  chunks,
});
await writeScheduleRows(schedule.rows);
console.log(scheduleReport(schedule, graphs));
