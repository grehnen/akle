import type { GraphVersionHeader } from "./graphVersionFiles";

/** A graph version's header and a content hash per file in its directory. */
export type CommittedGraphVersion = GraphVersionHeader & {
  files: Readonly<Record<string, string>>;
};

/**
 * Why the current graph versions break ADR 0004's freeze, compared with the previous ones: a
 * version a played trip has used must stay byte for byte as it was, and no version may start
 * at a trip that is already played. An empty list means the change is allowed.
 */
export function frozenGraphVersionViolations(input: {
  previous: readonly CommittedGraphVersion[];
  current: readonly CommittedGraphVersion[];
  playedThrough: number;
}): string[] {
  const { previous, current, playedThrough } = input;
  const violations: string[] = [];

  for (const frozen of previous.filter((version) => version.startsAtTrip <= playedThrough)) {
    const prefix = `Graph version ${frozen.id} is frozen (played since #${frozen.startsAtTrip})`;
    const now = current.find((version) => version.id === frozen.id);
    if (now === undefined) {
      violations.push(`${prefix}: removed`);
      continue;
    }
    if (now.startsAtTrip !== frozen.startsAtTrip) {
      violations.push(`${prefix}: starting trip moved to #${now.startsAtTrip}`);
    }
    for (const [file, hash] of Object.entries(frozen.files)) {
      if (!(file in now.files)) violations.push(`${prefix}: ${file} removed`);
      else if (now.files[file] !== hash) violations.push(`${prefix}: ${file} changed`);
    }
    for (const file of Object.keys(now.files)) {
      if (!(file in frozen.files)) violations.push(`${prefix}: ${file} added`);
    }
  }

  for (const version of current.filter((candidate) => candidate.startsAtTrip <= playedThrough)) {
    const before = previous.find((earlier) => earlier.id === version.id);
    if (before === undefined || before.startsAtTrip > playedThrough) {
      violations.push(
        `Graph version ${version.id} starts at #${version.startsAtTrip}, but trips up to #${playedThrough} are already played`,
      );
    }
  }
  return violations;
}
