import { useCopyToast } from "./useCopyToast";

/**
 * Copies the share text to the clipboard and confirms with a short-lived toast. As a screen's
 * `primary` action it takes the yellow of the app's main actions.
 */
export function ShareButton({ text, primary = false }: { text: string; primary?: boolean }) {
  const { toast, copy } = useCopyToast();
  return (
    <div className="share">
      <button
        type="button"
        className={primary ? "share-button primary-button" : "share-button"}
        onClick={() => void copy(text)}
      >
        Dela resultat
      </button>
      <p role="status" aria-live="polite" className="share-toast">
        {toast}
      </p>
    </div>
  );
}
