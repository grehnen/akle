import type { ReactNode } from "react";

/**
 * The track the distance slider and the Antal slider share: the `input`s stacked over it, and
 * the stretch between `startPercent` and `endPercent` filled. Styled by `.distance-range-track`.
 */
export function SliderTrack({
  startPercent,
  endPercent,
  children,
}: {
  startPercent: number;
  endPercent: number;
  children: ReactNode;
}) {
  return (
    <div className="distance-range-track">
      <span
        className="distance-range-fill"
        style={{ left: `${startPercent}%`, right: `${100 - endPercent}%` }}
      />
      {children}
    </div>
  );
}
