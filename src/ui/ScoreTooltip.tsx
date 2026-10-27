import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { SCORE_EXPLANATION } from "./messages";
import "./ScoreTooltip.css";

/**
 * A score that explains itself: hovering, focusing or tapping it shows {@link SCORE_EXPLANATION}
 * beside it, as its description to screen readers too. A tap elsewhere, Escape, or the pointer or
 * focus leaving it hides it again.
 */
export function ScoreTooltip({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const wrapper = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnTapElsewhere = (event: Event) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnTapElsewhere);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnTapElsewhere);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <span ref={wrapper} className="score-tooltip">
      <button
        type="button"
        className="score-tooltip-trigger"
        aria-describedby={open ? tooltipId : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") setOpen(true);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse" && event.currentTarget !== document.activeElement) {
            setOpen(false);
          }
        }}
      >
        {children}
      </button>
      {open && (
        <span role="tooltip" id={tooltipId} className="score-tooltip-bubble">
          {SCORE_EXPLANATION}
        </span>
      )}
    </span>
  );
}
