import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import "./Tooltip.css";

/** The least room, in pixels, kept between the bubble and the screen's edge. */
const EDGE_GAP = 8;

/**
 * Text that explains itself: hovering, focusing or tapping it shows `text` beside it, as its
 * description to screen readers too. A tap elsewhere, Escape, or the pointer or focus leaving it
 * hides it again.
 */
export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
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
    <span ref={wrapper} className="tooltip">
      <button
        type="button"
        className="tooltip-trigger"
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
        <span ref={keepInsideScreen} role="tooltip" id={tooltipId} className="tooltip-bubble">
          {text}
        </span>
      )}
    </span>
  );
}

/**
 * Shifts a bubble shown by text near the screen's edge back inside, by what would stick out. It
 * measures the bubble unshifted, so calling it again (as React's strict mode does) keeps the shift.
 */
function keepInsideScreen(bubble: HTMLElement | null) {
  if (bubble === null) return;
  bubble.style.removeProperty("--tooltip-shift");
  const { left, right } = bubble.getBoundingClientRect();
  const room = document.documentElement.clientWidth;
  const shift = left < EDGE_GAP ? EDGE_GAP - left : Math.min(0, room - EDGE_GAP - right);
  bubble.style.setProperty("--tooltip-shift", `${shift}px`);
}
