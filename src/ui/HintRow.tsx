import { type RefObject, useEffect, useRef } from "react";
import { HINT_LABELS, hintRevealed } from "./messages";

type HintRowProps = {
  toast?: string;
  /** Hides the hint buttons once the game has ended; the toast stays. */
  finished: boolean;
  hintsUsed: number;
  onTakeHint: () => void;
  /** Where focus goes when the last hint disables every button, so it doesn't drop to the page top. */
  focusAfterLastHint: RefObject<HTMLElement | null>;
};

/**
 * The toast and one button per hint, stacked as on travle.earth: only the topmost hint not yet
 * taken is enabled. Under them, what the latest hint revealed.
 */
export function HintRow({
  toast,
  finished,
  hintsUsed,
  onTakeHint,
  focusAfterLastHint,
}: HintRowProps) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const focusNextHint = useRef(false);

  // The next button is still disabled when one is clicked, so focus moves once it is enabled.
  useEffect(() => {
    if (!focusNextHint.current) return;
    focusNextHint.current = false;
    buttons.current[hintsUsed]?.focus();
  }, [hintsUsed]);

  return (
    <div className="hint-row">
      <p role="alert" className="toast">
        {toast}
      </p>
      {!finished && (
        <>
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
                  {label}
                  {taken && (
                    <>
                      <span aria-hidden="true"> ✓</span>
                      <span className="visually-hidden"> (använd)</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
          <p className="hint-note">{hintRevealed(hintsUsed)}</p>
        </>
      )}
    </div>
  );
}
