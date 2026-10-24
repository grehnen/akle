import type { GraphVersion } from "../graph/graphVersion";
import { graphVersionFor } from "../graph/graphVersionFiles";
import type { Cooldown, ScheduledTrip } from "./schedule";
import { ScheduleHistory } from "./scheduleHistory";

export type ScheduleRulesInput = Cooldown & {
  /** The whole schedule as it would be committed. */
  rows: readonly ScheduledTrip[];
  /** The schedule before the change, to protect played rows. */
  previousRows: readonly ScheduledTrip[];
  graphs: readonly GraphVersion[];
  /** Rows up to this trip number are played: frozen, and exempt from the other rules. */
  playedThrough: number;
};

/** The schedule rules check (ADR 0001): every broken rule, or none. */
export function checkScheduleRules(input: ScheduleRulesInput): string[] {
  const violations = [
    ...sequenceViolations(input.rows),
    ...playedRowViolations(input.rows, input.previousRows, input.playedThrough),
  ];
  const history = new ScheduleHistory(input);
  for (const row of input.rows) {
    if (row.number > input.playedThrough) {
      const graph = graphVersionFor(input.graphs, row.number);
      if (graph) violations.push(...history.violations(row, graph));
      else violations.push(`Trip #${row.number}: no graph version covers it`);
    }
    history.add(row);
  }
  return violations;
}

function sequenceViolations(rows: readonly ScheduledTrip[]): string[] {
  const outOfSequence = rows.findIndex((row, index) => row.number !== index + 1);
  if (outOfSequence === -1) return [];
  return [
    `Trip numbers must run 1, 2, 3, …: expected #${outOfSequence + 1}, got #${rows[outOfSequence].number}`,
  ];
}

function playedRowViolations(
  rows: readonly ScheduledTrip[],
  previousRows: readonly ScheduledTrip[],
  playedThrough: number,
): string[] {
  const current = new Map(rows.map((row) => [row.number, row]));
  const describe = (row: ScheduledTrip | undefined) =>
    row ? `${row.start},${row.destination},${row.n}` : "missing";
  return previousRows
    .filter((previous) => previous.number <= playedThrough)
    .filter((previous) => describe(previous) !== describe(current.get(previous.number)))
    .map(
      (previous) =>
        `Trip #${previous.number} is played and must not change: was ${describe(previous)}, now ${describe(current.get(previous.number))}`,
    );
}
