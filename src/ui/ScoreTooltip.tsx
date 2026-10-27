import type { ReactNode } from "react";
import { SCORE_EXPLANATION } from "./messages";
import { Tooltip } from "./Tooltip";

/** A score that explains itself with {@link SCORE_EXPLANATION}, as a {@link Tooltip}. */
export function ScoreTooltip({ children }: { children: ReactNode }) {
  return <Tooltip text={SCORE_EXPLANATION}>{children}</Tooltip>;
}
