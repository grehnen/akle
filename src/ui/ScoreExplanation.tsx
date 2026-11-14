import { SCORE_EXPLANATION } from "./messages";

const EMPHASIZED_WORD = "perfekt";

/** {@link SCORE_EXPLANATION} with its word "perfekt" in italics. */
export function ScoreExplanation() {
  const start = SCORE_EXPLANATION.indexOf(EMPHASIZED_WORD);
  const end = start + EMPHASIZED_WORD.length;
  return (
    <>
      {SCORE_EXPLANATION.slice(0, start)}
      <em>{EMPHASIZED_WORD}</em>
      {SCORE_EXPLANATION.slice(end)}
    </>
  );
}
