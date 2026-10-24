import { type ReactNode, type RefObject, useEffect, useRef } from "react";
import { HINT_LABELS } from "./messages";

type HintSectionProps = {
  hintsUsed: number;
  onTakeHint: () => void;
  /** Where focus goes when the last hint disables every button, so it doesn't drop to the page top. */
  focusAfterLastHint: RefObject<HTMLElement | null>;
  /** Shown after the hint buttons, such as a free-play trip's Ge upp. */
  children?: ReactNode;
};

/**
 * A headed section with one numbered button per hint, side by side when they fit and stacked
 * when they don't. Hints are taken in order: only the first one not yet taken is enabled.
 */
export function HintSection({
  hintsUsed,
  onTakeHint,
  focusAfterLastHint,
  children,
}: HintSectionProps) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const focusNextHint = useRef(false);

  // The next button is still disabled when one is clicked, so focus moves once it is enabled.
  useEffect(() => {
    if (!focusNextHint.current) return;
    focusNextHint.current = false;
    buttons.current[hintsUsed]?.focus();
  }, [hintsUsed]);

  return (
    <section className="hint-section" aria-labelledby="hints-heading">
      <h3 id="hints-heading" className="section-heading">
        Ledtrådar{" "}
        <span aria-hidden="true">
          ({hintsUsed}/{HINT_LABELS.length})
        </span>
        <span className="visually-hidden">
          ({hintsUsed} av {HINT_LABELS.length} använda)
        </span>
      </h3>
      <div role="group" aria-label="Ledtrådar" className="hint-buttons">
        {HINT_LABELS.map((label, index) => {
          const taken = index < hintsUsed;
          return (
            <button
              key={label}
              ref={(button) => {
                buttons.current[index] = button;
              }}
              type="button"
              className={taken ? "hint-button taken" : "hint-button"}
              disabled={index !== hintsUsed}
              onClick={() => {
                if (index + 1 >= HINT_LABELS.length) focusAfterLastHint.current?.focus();
                else focusNextHint.current = true;
                onTakeHint();
              }}
            >
              <span className="hint-step" aria-hidden="true">
                {taken ? "✓" : index + 1}
              </span>
              {label}
              {taken && <span className="visually-hidden"> (använd)</span>}
            </button>
          );
        })}
      </div>
      {children}
    </section>
  );
}
