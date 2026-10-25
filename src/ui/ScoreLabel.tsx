import { tripOutcomeLabel } from "../freePlay/shareText";
import type { Outcome } from "../progress/outcome";
import { timeoutsText } from "./messages";

/**
 * A free-play trip's outcome label as the share text words it (`+1 (1 ledtråd, 2 ⏱)`), with its
 * timeouts read in words to screen readers: `Tiden ute 2 gånger`.
 */
export function ScoreLabel({ outcome }: { outcome: Outcome }) {
  return tripOutcomeLabel(outcome)
    .split(/(\d+ ⏱)/)
    .map((part, index) => {
      const timeouts = /^(\d+) ⏱$/.exec(part);
      if (timeouts === null) return part;
      return (
        // oxlint-disable-next-line react/no-array-index-key -- the parts of one fixed string.
        <span key={index}>
          <span aria-hidden="true">{part}</span>
          <span className="visually-hidden">{timeoutsText(Number(timeouts[1]))}</span>
        </span>
      );
    });
}
