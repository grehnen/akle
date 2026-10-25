import { tripOutcomeLabelParts } from "../freePlay/shareText";
import type { Outcome } from "../progress/outcome";
import { labelText, timeoutsText } from "./messages";

/**
 * A free-play trip's outcome label as the share text words it (`+1 (1 ledtråd, 2 ⏱)`), with its
 * timeouts read in words to screen readers: `Tiden ute 2 gånger`.
 */
export function ScoreLabel({ outcome }: { outcome: Outcome }) {
  return tripOutcomeLabelParts(outcome).map((part, index) => {
    if (typeof part === "string") return part;
    return (
      // oxlint-disable-next-line react/no-array-index-key -- the parts of one fixed label.
      <span key={index}>
        <span aria-hidden="true">{labelText([part])}</span>
        <span className="visually-hidden">{timeoutsText(part.timeouts)}</span>
      </span>
    );
  });
}
