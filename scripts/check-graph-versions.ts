// bun run graph-versions:check [--base <git revision>] [--now <ISO date>]
// The frozen graph versions check (ADR 0004): versions a played puzzle has used are unchanged
// from the base revision (HEAD by default), and no version starts at an already played puzzle.
// A puzzle only counts as played if the base scheduled it.
import { playedThroughAtBase } from "../src/daily/puzzleNumber";
import { frozenGraphVersionViolations } from "../src/graph/frozenGraphVersions";
import { readCommittedGraphVersions, readCommittedGraphVersionsAt } from "./graphVersionData";
import { checkArguments, readScheduleConfig, readScheduleRowsAt } from "./scheduleData";

const { base, now } = checkArguments();

const config = await readScheduleConfig();
const playedThrough = playedThroughAtBase(now, config.epoch, readScheduleRowsAt(base));
const current = await readCommittedGraphVersions();
const violations = frozenGraphVersionViolations({
  previous: await readCommittedGraphVersionsAt(base),
  current,
  playedThrough,
});

if (violations.length > 0) {
  console.error(`Frozen graph versions check failed (${violations.length}):`);
  for (const violation of violations) console.error(`- ${violation}`);
  console.error("Put the change in a new graph version instead; see data/README.md.");
  process.exit(1);
}
const frozen = current.filter((version) => version.startsAtPuzzle <= playedThrough);
console.log(
  `Frozen graph versions check passed: ${frozen.map((version) => version.id).join(", ") || "none"} frozen, played through #${playedThrough}, compared with ${base}.`,
);
