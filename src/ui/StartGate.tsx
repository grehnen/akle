import { type ReactNode, useEffect, useRef } from "react";
import "./StartGate.css";

/**
 * The `Starta` gate a trip on the clock opens behind, in free play or an itinerary: its ends stay
 * hidden, with no free look, until the player presses `Starta`, which is when its time starts.
 * `onTheClock` says whether real time counts for the trip, which the gate then warns of.
 */
export function StartGate({
  label,
  onStart,
  onTheClock = true,
}: {
  label?: ReactNode;
  onStart: () => void;
  onTheClock?: boolean;
}) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => button.current?.focus(), []);
  return (
    <section className="start-gate" aria-labelledby="start-gate-heading">
      {label}
      <h2 id="start-gate-heading">Redo att resa?</h2>
      <p className="start-gate-note">Start och mål visas när du startar.</p>
      <button ref={button} type="button" className="start-gate-button" onClick={onStart}>
        Starta
      </button>
      {onTheClock && <p className="start-gate-note">Tiden går även om du lämnar sidan.</p>}
    </section>
  );
}
