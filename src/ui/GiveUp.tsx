import { useEffect, useRef, useState } from "react";
import "./Modal.css";

/**
 * The Ge upp button, shown and enabled throughout a free-play trip. Pressing it asks first, since
 * a give-up ends the trip.
 */
export function GiveUp({ onGiveUp }: { onGiveUp: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <button type="button" className="give-up-button" onClick={() => setConfirming(true)}>
        Ge upp
      </button>
      {confirming && (
        <GiveUpDialog
          onConfirm={() => {
            setConfirming(false);
            onGiveUp();
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}

function GiveUpDialog({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="modal give-up-dialog"
      aria-labelledby="give-up-heading"
      aria-describedby="give-up-text"
      onClose={onCancel}
    >
      <h2 id="give-up-heading">Ge upp?</h2>
      <p id="give-up-text">Resan tar slut och räknas som förlorad.</p>
      <div className="give-up-actions">
        <button type="button" className="give-up-cancel" autoFocus onClick={onCancel}>
          Fortsätt spela
        </button>
        <button type="button" className="give-up-confirm" onClick={onConfirm}>
          Ge upp
        </button>
      </div>
    </dialog>
  );
}
