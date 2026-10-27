import { useId, useState } from "react";
import type { Trip } from "../engine/game";
import type { SetupChoice } from "../freePlay/setupChoice";
import type { GraphVersion } from "../graph/graphVersion";
import { Modal } from "./Modal";
import type { TripChoiceTab } from "./TripChoice";
import { TripSetup } from "./TripSetup";
import "./TripModal.css";

/** What the trip modal was left with: its setup, and the drawn trips' count or the picked trip. */
export type TripModalResult = { choice: SetupChoice } & (
  | { tab: "draw"; count: number }
  | { tab: "pick"; trip: Trip }
);

/**
 * The builder's modal for setting up a trip: the shared setup, with its short mode texts, and
 * Avbryt and the button that takes the setup in its footer. Given `room`, it adds trips: Antal
 * then draws up to that many at once, and the button counts them. Without `room`, it edits one
 * trip, and `initialPair` opens it on Välj själv with a picked trip's pair.
 */
export function TripModal({
  graph,
  largest,
  heading,
  initial,
  initialPair,
  submitLabel,
  room,
  onCancel,
  onSubmit,
}: {
  graph: GraphVersion;
  /** The largest distance in the version, the distance range's top. */
  largest: number;
  heading: string;
  initial: SetupChoice;
  /** Editing a picked trip: its pair, which Välj själv opens filled with. */
  initialPair?: Trip;
  /** The button's words where it doesn't count the trips it adds. */
  submitLabel: string;
  /** Adding: how many more trips fit. */
  room?: number;
  onCancel: () => void;
  onSubmit: (result: TripModalResult) => void;
}) {
  const [choice, setChoice] = useState(initial);
  const [tab, setTab] = useState<TripChoiceTab>(initialPair ? "pick" : "draw");
  const [picked, setPicked] = useState<Trip | undefined>(initialPair);
  const [count, setCount] = useState(1);
  const adding = room !== undefined;
  const maxCount = Math.max(1, room ?? 1);
  const drawCount = Math.min(count, maxCount);

  const label =
    adding && tab === "draw"
      ? `Lägg till ${drawCount} ${drawCount === 1 ? "resa" : "resor"}`
      : submitLabel;
  const submit = () => {
    if (tab === "draw") onSubmit({ choice, tab, count: drawCount });
    else if (picked !== undefined) onSubmit({ choice, tab, trip: picked });
  };

  return (
    <Modal
      label={heading}
      className="trip-modal"
      sheet
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="trip-modal-cancel" onClick={onCancel}>
            Avbryt
          </button>
          <button
            type="button"
            className="trip-modal-submit"
            disabled={tab === "pick" && picked === undefined}
            onClick={submit}
          >
            {label}
          </button>
        </>
      }
    >
      <h2 className="trip-modal-heading">{heading}</h2>
      <TripSetup
        graph={graph}
        largest={largest}
        initial={initial}
        initialPair={initialPair}
        onChange={setChoice}
        shortDescriptions
        drawActions={
          adding &&
          maxCount > 1 && <CountSlider count={drawCount} max={maxCount} onChange={setCount} />
        }
        onTabChange={setTab}
        onPickedChange={setPicked}
      />
    </Modal>
  );
}

/** Antal: how many trips Slumpa adds, from 1 to `max`, looking like the distance slider. */
function CountSlider({
  count,
  max,
  onChange,
}: {
  count: number;
  max: number;
  onChange: (count: number) => void;
}) {
  const id = `count-${useId().replace(/[^\w-]/g, "")}`;
  const percent = ((count - 1) / (max - 1)) * 100;
  return (
    <div className="distance-range">
      <label className="free-play-range-label" htmlFor={id}>
        Antal <strong>{count}</strong>
        <span className="trip-modal-count-max"> av högst {max}</span>
      </label>
      <div className="distance-range-track">
        <span className="distance-range-fill" style={{ left: 0, right: `${100 - percent}%` }} />
        <input
          id={id}
          type="range"
          min={1}
          max={max}
          value={count}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </div>
    </div>
  );
}
