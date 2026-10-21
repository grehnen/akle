import { useEffect, useRef } from "react";
import type { Stats } from "../progress/stats";
import { StatsPanel } from "./StatsPanel";
import "./StatsDialog.css";

type StatsDialogProps = {
  stats: Stats;
  onClose: () => void;
};

/** The stats as a modal, opened from the header; Escape, the backdrop or Stäng closes it. */
export function StatsDialog({ stats, onClose }: StatsDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="stats-dialog"
      aria-label="Statistik"
      onClose={onClose}
      onClick={(event) => event.target === dialog.current && dialog.current.close()}
      onKeyDown={(event) => event.key === "Escape" && dialog.current?.close()}
    >
      <StatsPanel stats={stats} />
      <button type="button" className="stats-close" onClick={() => dialog.current?.close()}>
        Stäng
      </button>
    </dialog>
  );
}

export function StatsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      <path
        d="M4 20V13M10 20V6M16 20V10M22 20H2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
    </svg>
  );
}
