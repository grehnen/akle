import { type ReactNode, useEffect, useRef } from "react";
import type { ModeSetting } from "../freePlay/linkPayload";
import { modeDescription } from "./messages";
import "./StartGate.css";

/**
 * The `Starta` gate a trip on the clock opens behind, in free play or an itinerary: its ends stay
 * hidden, with no free look, until the player presses `Starta`, the reveal, which is when its time
 * starts. The trip's board loads behind it meanwhile: until it is `ready`, `Starta` waits, saying
 * the map is loading, and says once when it's done. Under its label, the gate says how the trip's
 * mode plays, never naming its ends. `onTheClock` says whether real time counts for the trip,
 * which the gate then warns of. `wayBack`, free play's only, leads back to setup.
 */
export function StartGate({
  label,
  mode,
  ready,
  onStart,
  onTheClock = true,
  wayBack,
}: {
  label?: ReactNode;
  mode: ModeSetting;
  ready: boolean;
  onStart: () => void;
  onTheClock?: boolean;
  wayBack?: ReactNode;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const gate = useRef<HTMLElement>(null);
  useEffect(() => button.current?.focus(), []);
  // Starta keeps focus while it waits; if focus fell out of the page meanwhile, it comes back.
  // Wherever else the player put it, it stays.
  useEffect(() => {
    if (!ready) return;
    const focused = document.activeElement;
    if (focused === null || focused === document.body || focused === gate.current) {
      button.current?.focus();
    }
  }, [ready]);
  return (
    <section
      ref={gate}
      className="start-gate"
      aria-labelledby="start-gate-heading"
      aria-busy={ready ? undefined : true}
    >
      {label}
      <p className="start-gate-mode">{modeDescription(mode.kind)}</p>
      <h2 id="start-gate-heading">Redo att resa?</h2>
      <p className="start-gate-note">Start och mål visas när du startar.</p>
      {/* Not `disabled`, so Starta holds focus while the map loads. */}
      <button
        ref={button}
        type="button"
        className="start-gate-button"
        aria-disabled={ready ? undefined : true}
        onClick={() => {
          if (ready) onStart();
        }}
      >
        Starta
      </button>
      <p className="start-gate-status" aria-live="polite">
        {ready ? (
          "Kartan är klar"
        ) : (
          <>
            <span className="start-gate-spinner" aria-hidden="true" />
            Laddar kartan…
          </>
        )}
      </p>
      {onTheClock && <p className="start-gate-note">Tiden går även om du lämnar sidan.</p>}
      {wayBack}
    </section>
  );
}
