import { type ReactNode, useEffect, useRef } from "react";
import { CloseIcon } from "./CloseIcon";
import "./Modal.css";

type ModalProps = {
  label: string;
  className?: string;
  onClose: () => void;
  children: ReactNode;
};

/** A modal opened from the header; Escape, the backdrop or the ✕ closes it. */
export function Modal({ label, className, onClose, children }: ModalProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className={className ? `modal ${className}` : "modal"}
      aria-label={label}
      onClose={onClose}
      onClick={(event) => event.target === dialog.current && dialog.current.close()}
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
      {children}
    </dialog>
  );
}
