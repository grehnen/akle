import { tripOutcomeLabelParts } from "../freePlay/shareText";
import type { Outcome } from "../progress/outcome";
import { COST_SEPARATOR, type LabelPart, labelText, timeoutsText } from "./messages";

/**
 * A free-play trip's outcome label as the share text words it (`+1 (1 ledtråd, 2 ⏱)`), with its
 * timeouts read in words to screen readers: `Tiden ute 2 gånger`. Each stretch between its
 * costs' separators is a `.score-label-piece`, so a narrow place can keep those whole and break
 * the label only after a comma.
 */
export function ScoreLabel({ outcome }: { outcome: Outcome }) {
  const pieces: LabelPart[][] = [[]];
  for (const part of tripOutcomeLabelParts(outcome)) {
    if (part === COST_SEPARATOR) pieces.push([]);
    else pieces[pieces.length - 1].push(part);
  }
  return pieces.map((piece, pieceIndex) => {
    const last = pieceIndex === pieces.length - 1;
    return (
      // oxlint-disable-next-line react/no-array-index-key -- the pieces of one fixed label.
      <span key={pieceIndex}>
        <span className="score-label-piece">
          {piece.map((part, index) => {
            if (typeof part === "string") return part;
            return (
              // oxlint-disable-next-line react/no-array-index-key -- the parts of one fixed label.
              <span key={index}>
                <span aria-hidden="true">{labelText([part])}</span>
                <span className="visually-hidden">{timeoutsText(part.timeouts)}</span>
              </span>
            );
          })}
          {/* The separator's comma stays with its piece, so a line never starts with one. */}
          {!last && ","}
        </span>
        {!last && " "}
      </span>
    );
  });
}
