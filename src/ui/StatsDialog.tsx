import type { Stats } from "../progress/stats";
import { Modal } from "./Modal";
import { StatsPanel } from "./StatsPanel";

type StatsDialogProps = {
  stats: Stats;
  onClose: () => void;
};

export function StatsDialog({ stats, onClose }: StatsDialogProps) {
  return (
    <Modal label="Statistik" onClose={onClose}>
      <StatsPanel stats={stats} />
    </Modal>
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
