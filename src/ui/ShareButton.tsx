import { useEffect, useState } from "react";
import { copyShareText } from "./copyShareText";

/** Copies the share text to the clipboard and confirms with a short-lived toast. */
export function ShareButton({ text }: { text: string }) {
  const [toast, setToast] = useState("");
  useEffect(() => {
    if (toast === "") return;
    const timer = setTimeout(() => setToast(""), 2000);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <div className="share">
      <button
        type="button"
        className="share-button"
        onClick={() => void copyShareText(globalThis.navigator?.clipboard, text).then(setToast)}
      >
        Kopiera resultat
      </button>
      <p role="status" aria-live="polite" className="share-toast">
        {toast}
      </p>
    </div>
  );
}
