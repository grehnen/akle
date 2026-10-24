import type { DistanceRange } from "../freePlay/draw";

type DistanceRangeSliderProps = {
  range: DistanceRange;
  /** The largest distance in the version; the slider runs from 1 to it. */
  largest: number;
  onChange: (range: DistanceRange) => void;
};

/** One slider with two thumbs for an inclusive distance range, labelled "Avstånd 3–8". */
export function DistanceRangeSlider({ range, largest, onChange }: DistanceRangeSliderProps) {
  const { min, max } = range;
  const percent = (value: number) => (largest <= 1 ? 0 : ((value - 1) / (largest - 1)) * 100);
  // Stacked thumbs on the same value: the one that can still move goes on top.
  const minOnTop = min === max && max === largest;
  return (
    <div className="distance-range">
      <p className="free-play-range-label">
        Avstånd <strong>{min === max ? min : `${min}–${max}`}</strong>
      </p>
      <div className="distance-range-track">
        <span
          className="distance-range-fill"
          style={{ left: `${percent(min)}%`, right: `${100 - percent(max)}%` }}
        />
        <input
          type="range"
          aria-label="Minsta avstånd"
          min={1}
          max={largest}
          value={min}
          style={minOnTop ? { zIndex: 1 } : undefined}
          onChange={(event) => onChange({ min: Math.min(Number(event.target.value), max), max })}
        />
        <input
          type="range"
          aria-label="Största avstånd"
          min={1}
          max={largest}
          value={max}
          onChange={(event) => onChange({ min, max: Math.max(Number(event.target.value), min) })}
        />
      </div>
    </div>
  );
}
