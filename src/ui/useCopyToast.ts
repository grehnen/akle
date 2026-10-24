import { useEffect, useState } from "react";
import { copyShareText } from "./copyShareText";

/** How long the toast confirming a copy stays up. */
const TOAST_MS = 2000;

/**
 * Copies text to the clipboard and gives the short-lived toast that confirms it (or says the
 * copy failed), for a polite live region beside the button.
 */
export function useCopyToast(): { toast: string; copy: (text: string) => void } {
  const [toast, setToast] = useState("");
  useEffect(() => {
    if (toast === "") return;
    const timer = setTimeout(() => setToast(""), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);
  const copy = (text: string) =>
    void copyShareText(globalThis.navigator?.clipboard, text).then(setToast);
  return { toast, copy };
}
