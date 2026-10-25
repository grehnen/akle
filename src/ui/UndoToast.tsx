import { useEffect, useState } from "react";

/** How long Ångra stays up after a removal, unless the pointer or focus is on it. */
const UNDO_MS = 5000;

/**
 * The latest removal Ångra can bring back, until it does, its time runs out, or `showRemoval`
 * replaces or clears it. `hold` keeps it up while the pointer or focus is on its toast; a new or
 * cleared removal is never held, wherever the pointer or focus was on the last one's toast.
 */
export function useUndoRemoval<Removal>(): {
  removed: Removal | undefined;
  showRemoval: (removal: Removal | undefined) => void;
  hold: (held: boolean) => void;
} {
  const [removed, setRemoved] = useState<Removal>();
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (removed === undefined || held) return;
    const timer = setTimeout(() => setRemoved(undefined), UNDO_MS);
    return () => clearTimeout(timer);
  }, [removed, held]);
  const showRemoval = (removal: Removal | undefined) => {
    setRemoved(removal);
    setHeld(false);
  };
  return { removed, showRemoval, hold: setHeld };
}

/** "Resa N borttagen" and Ångra; held up while the pointer or focus is on it. */
export function UndoToast({
  number,
  onUndo,
  onHold,
}: {
  number: number;
  onUndo: () => void;
  onHold: (held: boolean) => void;
}) {
  return (
    <div
      className="itinerary-undo"
      onPointerEnter={() => onHold(true)}
      onPointerLeave={() => onHold(false)}
      onFocus={() => onHold(true)}
      onBlur={() => onHold(false)}
    >
      <span>Resa {number} borttagen</span>
      <button type="button" onClick={onUndo}>
        Ångra
      </button>
    </div>
  );
}
