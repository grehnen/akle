// bun run runway:check [--now <ISO date>]
// The required runway check (ADR 0001): fails when fewer than 30 days of puzzles are left.
import { runwayDays, runwayViolation } from "../src/schedule/runway";
import { argument, readScheduleConfig, readScheduleRows } from "./scheduleData";

const now = new Date(argument("now") ?? Date.now());
const days = runwayDays(await readScheduleRows(), now, (await readScheduleConfig()).epoch);
const violation = runwayViolation(days);

if (violation) {
  console.error(`Runway check failed: ${violation}`);
  process.exit(1);
}
console.log(`Runway check passed: ${days} days of puzzles left.`);
