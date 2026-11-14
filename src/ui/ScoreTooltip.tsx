import type { ReactNode } from "react";
import { ScoreExplanation } from "./ScoreExplanation";
import { Tooltip } from "./Tooltip";

/** A score that explains itself with {@link ScoreExplanation}, as a {@link Tooltip}. */
export function ScoreTooltip({ children }: { children: ReactNode }) {
  return <Tooltip text={<ScoreExplanation />}>{children}</Tooltip>;
}
