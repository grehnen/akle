import { useEffect, useRef } from "react";
import { CloseIcon } from "./CloseIcon";

/** The link in a read-only field, selected, for the player to copy by hand. */
export function CopyFallback({ url, onClose }: { url: string; onClose: () => void }) {
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);
  return (
    <div className="itinerary-copy-fallback">
      <label htmlFor="itinerary-copy-fallback">Kunde inte kopiera. Kopiera länken själv:</label>
      <input
        ref={field}
        id="itinerary-copy-fallback"
        readOnly
        value={url}
        onFocus={(event) => event.target.select()}
      />
      <button type="button" aria-label="Stäng" onClick={onClose}>
        <CloseIcon />
      </button>
    </div>
  );
}
