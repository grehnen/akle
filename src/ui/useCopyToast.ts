import { useEffect, useState } from "react";
import { COPIED, copyShareText } from "./copyShareText";

/** How long the toast confirming a copy stays up. */
const TOAST_MS = 2000;

/**
 * Copies text to the clipboard and gives the short-lived toast that confirms it (or says the
 * copy failed), for a polite live region beside the button. `copy` tells whether it copied.
 */
export function useCopyToast(): { toast: string; copy: (text: string) => Promise<boolean> } {
  const [toast, setToast] = useState("");
  useEffect(() => {
    if (toast === "") return;
    const timer = setTimeout(() => setToast(""), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);
  const copy = async (text: string) => {
    const message = await copyShareText(globalThis.navigator?.clipboard, text);
    setToast(message);
    return message === COPIED;
  };
  return { toast, copy };
}
