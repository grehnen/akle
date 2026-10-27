import { type ReactNode, useEffect, useRef } from "react";
import type { ModeSetting } from "../freePlay/linkPayload";
import { modeDescription } from "./messages";
import "./StartGate.css";

/**
 * The `Starta` gate a trip on the clock opens behind, in free play or an itinerary: its ends stay
 * hidden, with no free look, until the player presses `Starta`, the reveal, which is when its time
 * starts. The trip's board loads behind it meanwhile: until it is `ready`, `Starta` waits, saying
 * inside itself that the map is loading, and announces once when it's done. Under its heading and
 * label, the gate says how the trip's mode plays, never naming its ends. `onTheClock` says whether
 * real time counts for the trip, which the gate then warns of. `wayBack`, free play's only, leads
 * back to setup from the heading's row.
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
      <header className="start-gate-header">
        {wayBack}
        <h2 id="start-gate-heading">Redo att resa?</h2>
        {label}
      </header>
      <div className="start-gate-rules">
        <p>{modeDescription(mode.kind)}</p>
      </div>
      <div className="start-gate-action">
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
          {ready ? (
            "Starta"
          ) : (
            <>
              <span className="start-gate-spinner" aria-hidden="true" />
              Laddar kartan…
            </>
          )}
        </button>
        {/* Starta itself shows the loading; that it's done is only announced. */}
        <p className="start-gate-status visually-hidden" aria-live="polite">
          {ready ? "Kartan är klar" : ""}
        </p>
        <p className="start-gate-notes">
          <span>Start och mål visas när du startar.</span>
          {onTheClock && <span>Tiden går även om du lämnar sidan.</span>}
        </p>
      </div>
    </section>
  );
}
