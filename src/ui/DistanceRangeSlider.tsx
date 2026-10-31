import { useState } from "react";
import type { DistanceRange } from "../freePlay/draw";
import { SliderTrack } from "./SliderTrack";

type DistanceRangeSliderProps = {
  range: DistanceRange;
  /** The largest distance in the version; the slider runs from 1 to it. */
  largest: number;
  onChange: (range: DistanceRange) => void;
};

/**
 * One slider with two thumbs for an inclusive distance range, labelled "Avstånd 3–8". Either thumb
 * can pass the other: each input stays the thumb being dragged, and the lower one is the minimum.
 */
export function DistanceRangeSlider({ range, largest, onChange }: DistanceRangeSliderProps) {
  const { min, max } = range;
  const percent = (value: number) => (largest <= 1 ? 0 : ((value - 1) / (largest - 1)) * 100);
  const [thumbsCrossed, setThumbsCrossed] = useState(false);
  const firstThumb = thumbsCrossed ? max : min;
  const secondThumb = thumbsCrossed ? min : max;
  const moveThumbs = (first: number, second: number) => {
    // On the same value neither has passed the other, so which holds which end stays as it was.
    if (first !== second) setThumbsCrossed(first > second);
    onChange({ min: Math.min(first, second), max: Math.max(first, second) });
  };
  return (
    <div className="distance-range">
      <p className="free-play-range-label">
        Avstånd <strong>{min === max ? min : `${min}–${max}`}</strong>
      </p>
      <SliderTrack startPercent={percent(min)} endPercent={percent(max)}>
        <input
          type="range"
          aria-label={thumbsCrossed ? "Största avstånd" : "Minsta avstånd"}
          min={1}
          max={largest}
          value={firstThumb}
          onChange={(event) => moveThumbs(Number(event.target.value), secondThumb)}
        />
        <input
          type="range"
          aria-label={thumbsCrossed ? "Minsta avstånd" : "Största avstånd"}
          min={1}
          max={largest}
          value={secondThumb}
          onChange={(event) => moveThumbs(firstThumb, Number(event.target.value))}
        />
      </SliderTrack>
    </div>
  );
}
