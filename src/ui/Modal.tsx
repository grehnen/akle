import { type ReactNode, useEffect, useRef } from "react";
import { CloseIcon } from "./CloseIcon";
import "./Modal.css";

type ModalProps = {
  label: string;
  className?: string;
  onClose: () => void;
  /** The modal's actions, in a footer that stays in sight however far its content scrolls. */
  footer?: ReactNode;
  /**
   * One fixed height on a desktop, so content that changes inside it never resizes it, and the
   * whole screen on a phone.
   */
  sheet?: boolean;
  children: ReactNode;
};

/** A modal opened from the page; Escape or the ✕ closes it, never a click on the backdrop. */
export function Modal({ label, className, onClose, footer, sheet = false, children }: ModalProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className={["modal", sheet && "modal--sheet", className].filter(Boolean).join(" ")}
      aria-label={label}
      onClose={onClose}
      onKeyDown={(event) => event.key === "Escape" && dialog.current?.close()}
    >
      <button
        type="button"
        className="modal-close"
        aria-label="Stäng"
        autoFocus
        onClick={() => dialog.current?.close()}
      >
        <CloseIcon />
      </button>
      <div className="modal-body">{children}</div>
      {footer !== undefined && <div className="modal-footer">{footer}</div>}
    </dialog>
  );
}
