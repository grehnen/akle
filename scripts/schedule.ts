// bun run schedule [--chunks k] [--now <ISO date>]
// Reconciles unplayed rows, appends k chunks (default 1) and prints the PR report.
import { latestPlayedPuzzleNumber } from "../src/daily/puzzleNumber";
import { generateSchedule } from "../src/schedule/generateSchedule";
import { defaultCooldownDays } from "../src/schedule/schedule";
import { scheduleReport } from "../src/schedule/scheduleReport";
import {
  argument,
  readGraphVersions,
  readScheduleConfig,
  readScheduleRows,
  writeScheduleRows,
} from "./scheduleData";

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
  cooldownDays: config.cooldownDays ?? defaultCooldownDays,
  playedThrough: latestPlayedPuzzleNumber(now, config.epoch),
  chunks,
});
await writeScheduleRows(schedule.rows);
console.log(scheduleReport(schedule, graphs));
