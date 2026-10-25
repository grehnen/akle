import { useEffect, useState } from "react";
import { copyShareText } from "./copyShareText";

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
    const { copied, message } = await copyShareText(globalThis.navigator?.clipboard, text);
    setToast(message);
    return copied;
  };
  return { toast, copy };
}
