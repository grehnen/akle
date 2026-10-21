import type { RefObject } from "react";
import { HINT_COUNT } from "../engine/hints";
import { hintRevealed } from "./messages";
import { UsedCounter } from "./UsedCounter";

type HintRowProps = {
  toast?: string;
  /** Hides the Ledtråd button once the game has ended; the toast stays. */
  finished: boolean;
  hintsUsed: number;
  onTakeHint: () => void;
  /** Where focus goes when the last hint disables the button, so it doesn't drop to the page top. */
  focusAfterLastHint: RefObject<HTMLElement | null>;
};

/** The toast and the Ledtråd button with what the latest hint revealed. */
export function HintRow({
  toast,
  finished,
  hintsUsed,
  onTakeHint,
  focusAfterLastHint,
}: HintRowProps) {
  return (
    <div className="hint-row">
      <p role="alert" className="toast">
        {toast}
      </p>
      {!finished && (
        <>
          <button
            type="button"
            className="hint-button"
            disabled={hintsUsed >= HINT_COUNT}
            onClick={() => {
              if (hintsUsed + 1 >= HINT_COUNT) focusAfterLastHint.current?.focus();
              onTakeHint();
            }}
          >
            <UsedCounter label="Ledtråd" used={hintsUsed} limit={HINT_COUNT} />
          </button>
          <p className="hint-note">{hintRevealed(hintsUsed)}</p>
        </>
      )}
    </div>
  );
}
