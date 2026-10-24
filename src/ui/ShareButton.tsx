import { useCopyToast } from "./useCopyToast";

/** Copies the share text to the clipboard and confirms with a short-lived toast. */
export function ShareButton({ text }: { text: string }) {
  const { toast, copy } = useCopyToast();
  return (
    <div className="share">
      <button type="button" className="share-button" onClick={() => copy(text)}>
        Dela resultat
      </button>
      <p role="status" aria-live="polite" className="share-toast">
        {toast}
      </p>
    </div>
  );
}
