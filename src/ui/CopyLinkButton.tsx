import { useState } from "react";
import { createPortal } from "react-dom";
import { CopyFallback } from "./CopyFallback";
import { useCopyToast } from "./useCopyToast";
import "./CopyLinkButton.css";

/**
 * Kopiera länk: copies `url`, confirmed by a toast floating above the button. A failed copy shows
 * the link to copy by hand instead, in `fallbackTarget` when given (else after the button), until
 * a copy works, it's closed or `url` changes. No `url` disables the button.
 */
export function CopyLinkButton({
  url,
  fallbackTarget,
}: {
  url: string | undefined;
  fallbackTarget?: HTMLElement | null;
}) {
  const { toast, copy } = useCopyToast();
  // The link that failed to copy, shown until a copy works or the link changes.
  const [uncopied, setUncopied] = useState<string>();
  const [previousUrl, setPreviousUrl] = useState(url);
  if (url !== previousUrl) {
    setPreviousUrl(url);
    setUncopied(undefined);
  }
  const copyLink = async (link: string) => setUncopied((await copy(link)) ? undefined : link);

  const fallback = uncopied !== undefined && (
    <CopyFallback key={uncopied} url={uncopied} onClose={() => setUncopied(undefined)} />
  );
  return (
    <div className="copy-link">
      <p
        role="status"
        aria-live="polite"
        // The fallback says it instead.
        className={uncopied === undefined ? "copy-link-toast" : "visually-hidden"}
      >
        {toast}
      </p>
      <button
        type="button"
        className="copy-link-button"
        disabled={url === undefined}
        onClick={() => url !== undefined && void copyLink(url)}
      >
        Kopiera länk
      </button>
      {fallback && (fallbackTarget ? createPortal(fallback, fallbackTarget) : fallback)}
    </div>
  );
}
