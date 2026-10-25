// PROTOTYPE (B1/B2): throwaway. Never merge to main.
// Three layouts of the Starta gate (plus today's, as "nu"), each shown in every gated state stacked
// on one page, switchable via `?variant=nu|a|b|c` and the pink bar. `?telefon=1` narrows each state
// to a 390 px phone; the "Vänd laddning" pill flips every state between loading and ready live.
import { StrictMode, type ReactNode, useState } from "react";
import { createRoot } from "react-dom/client";
import "../styles.css";
import "./FreePlayScreen.css";
import "./ItineraryScreen.css";
import "./StartGate.css";
import "./StartGatePrototype.css";
import { pill, PrototypeSwitcher } from "./PrototypeSwitcher";

const TODAY_TIMED =
  "Varje gissning måste göras inom betänketiden. Varje gång tiden går ut kostar en poäng, även före första gissningen.";
const TIMED =
  "Varje gissning måste göras inom betänketiden. Varje gång tiden går ut kostar en poäng.";
const TIE_BREAKER = "Tiden tas. Vid lika poäng vinner den snabbaste.";
const HIDDEN_ENDS = "Start och mål visas när du startar.";
const CLOCK_NOTE = "Tiden går även om du lämnar sidan.";

type GateState = {
  caption: string;
  label: string;
  /** The itinerary's label, which today carries the `itinerary-progress` class too. */
  itinerary?: boolean;
  /** The mode's description as today's gate says it. */
  oldRules: string;
  rules: string;
  ready: boolean;
  /** Free play only: the itinerary has no way back. */
  wayBack: boolean;
  /** Shows Starta with its focus ring, as when opened from a link. */
  focused?: boolean;
};

// Only Tidspress and Tidtagning open at Starta (`opensAtStarta`): Standard and Obegränsad never show
// the gate, in free play or an itinerary, so they have no state here. Every gated trip is on the
// clock, so the time note always shows.
const STATES: GateState[] = [
  {
    caption: "Fri resa · Tidspress 10 s · kartan laddar",
    label: "Fri resa · Tidspress 10 s",
    oldRules: TODAY_TIMED,
    rules: TIMED,
    ready: false,
    wayBack: true,
  },
  {
    caption: "Fri resa · Tidspress 10 s · kartan klar",
    label: "Fri resa · Tidspress 10 s",
    oldRules: TODAY_TIMED,
    rules: TIMED,
    ready: true,
    wayBack: true,
  },
  {
    caption: "Fri resa · Tidtagning · öppnad från en länk, Starta har fokus",
    label: "Fri resa · Tidtagning",
    oldRules: TIE_BREAKER,
    rules: TIE_BREAKER,
    ready: true,
    wayBack: true,
    focused: true,
  },
  {
    caption: "Resplan · resa 2 av 3 · Tidspress 15 s · kartan laddar",
    label: "Söndagsturen · Resa 2 av 3 · Tidspress 15 s · Totalt 1 poäng",
    itinerary: true,
    oldRules: TODAY_TIMED,
    rules: TIMED,
    ready: false,
    wayBack: false,
  },
  {
    caption: "Resplan · resa 2 av 3 · Tidspress 15 s · kartan klar",
    label: "Söndagsturen · Resa 2 av 3 · Tidspress 15 s · Totalt 1 poäng",
    itinerary: true,
    oldRules: TODAY_TIMED,
    rules: TIMED,
    ready: true,
    wayBack: false,
  },
];

const VARIANTS = [
  { key: "nu", name: "dagens grind" },
  { key: "a", name: "tre block" },
  { key: "b", name: "tre block, tiden som regel" },
  { key: "c", name: "minimal" },
] as const;
type VariantKey = (typeof VARIANTS)[number]["key"];

type GateProps = { state: GateState; ready: boolean };

/** The decided way back: a small text link to setup, top-left of the gate. */
function BackLink() {
  return (
    <a className="sgp-back" href="/fri" onClick={(event) => event.preventDefault()}>
      ‹ Tillbaka
    </a>
  );
}

/** Starta with its loading state inside it, at one width loading or ready. */
function LoadingStarta({ ready, focused }: { ready: boolean; focused?: boolean }) {
  return (
    <>
      <button
        type="button"
        className={`start-gate-button sgp-starta${focused ? " sgp-focused" : ""}`}
        aria-disabled={ready ? undefined : true}
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
      {/* The done signal stays for screen readers only. */}
      <p className="visually-hidden" aria-live="polite">
        {ready ? "Kartan är klar" : ""}
      </p>
    </>
  );
}

function TripLabel({ state, className }: { state: GateState; className: string }) {
  return (
    <p className={`${className}${state.itinerary ? " itinerary-progress" : ""}`}>{state.label}</p>
  );
}

/** Today's gate, as shipped. */
function GateNow({ state, ready }: GateProps) {
  return (
    <section className="start-gate" aria-busy={ready ? undefined : true}>
      <TripLabel state={state} className="trip-number" />
      <p className="start-gate-mode">{state.oldRules}</p>
      <h2>Redo att resa?</h2>
      <p className="start-gate-note">{HIDDEN_ENDS}</p>
      <button
        type="button"
        className={`start-gate-button${state.focused ? " sgp-focused" : ""}`}
        aria-disabled={ready ? undefined : true}
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
      <p className="start-gate-note">{CLOCK_NOTE}</p>
      {state.wayBack && (
        <a className="free-play-setup-link" href="/fri" onClick={(event) => event.preventDefault()}>
          Välj läge och resa
        </a>
      )}
    </section>
  );
}

/** A: heading row with the way back, rules box, action with its two notes on two lines. */
function GateA({ state, ready }: GateProps) {
  return (
    <section className="start-gate sgp-blocks" aria-busy={ready ? undefined : true}>
      {/* The way back on the heading's row, the heading still centred in the gate. */}
      <header className="sgp-header sgp-header--row">
        {state.wayBack && <BackLink />}
        <h2>Redo att resa?</h2>
        <TripLabel state={state} className="sgp-subtitle" />
      </header>
      <div className="sgp-rules">
        <p>{state.rules}</p>
      </div>
      <div className="sgp-action">
        <LoadingStarta ready={ready} focused={state.focused} />
        <p className="sgp-caption">
          {HIDDEN_ENDS}
          <br />
          {CLOCK_NOTE}
        </p>
      </div>
    </section>
  );
}

/** B: like A, but the time note is a rule of the clocked modes, in the rules box. */
function GateB({ state, ready }: GateProps) {
  return (
    <section className="start-gate sgp-blocks" aria-busy={ready ? undefined : true}>
      {state.wayBack && <BackLink />}
      <header className="sgp-header">
        <h2>Redo att resa?</h2>
        <TripLabel state={state} className="sgp-subtitle" />
      </header>
      <ul className="sgp-rules sgp-rules--list">
        <li>{state.rules}</li>
        <li>{CLOCK_NOTE}</li>
      </ul>
      <div className="sgp-action">
        <LoadingStarta ready={ready} focused={state.focused} />
        <p className="sgp-caption">{HIDDEN_ENDS}</p>
      </div>
    </section>
  );
}

/** C: today's order, with loading moved into Starta and "Kartan är klar" gone. */
function GateC({ state, ready }: GateProps) {
  return (
    <section className="start-gate sgp-minimal" aria-busy={ready ? undefined : true}>
      {state.wayBack && <BackLink />}
      <TripLabel state={state} className="trip-number" />
      <p className="start-gate-mode">{state.rules}</p>
      <h2>Redo att resa?</h2>
      <p className="start-gate-note">{HIDDEN_ENDS}</p>
      <LoadingStarta ready={ready} focused={state.focused} />
      <p className="start-gate-note">{CLOCK_NOTE}</p>
    </section>
  );
}

const GATES: Record<VariantKey, (props: GateProps) => ReactNode> = {
  nu: GateNow,
  a: GateA,
  b: GateB,
  c: GateC,
};

function Stage({
  state,
  number,
  variant,
  flipped,
}: {
  state: GateState;
  number: number;
  variant: VariantKey;
  flipped: boolean;
}) {
  const Gate = GATES[variant];
  const ready = state.ready !== flipped;
  const caption = state.caption.replace(
    / · kartan (laddar|klar)$/,
    ` · kartan ${ready ? "klar" : "laddar"}`,
  );
  return (
    <div className="sgp-state">
      <p className="sgp-state-caption">
        {number}. {caption}
        {flipped && " (vänd)"}
      </p>
      <div className="sgp-device">
        <p className="sgp-app-title">Åkle</p>
        <Gate state={state} ready={ready} />
      </div>
    </div>
  );
}

function readParams() {
  const params = new URLSearchParams(window.location.search);
  const asked = params.get("variant")?.toLowerCase();
  const variant: VariantKey = VARIANTS.find(({ key }) => key === asked)?.key ?? "a";
  return { variant, phone: params.get("telefon") === "1", flipped: params.get("vand") === "1" };
}

function StartGatePrototype() {
  const [settings, setSettings] = useState(readParams);
  const update = (change: Partial<typeof settings>) => {
    const next = { ...settings, ...change };
    setSettings(next);
    const params = new URLSearchParams(window.location.search);
    params.set("variant", next.variant);
    if (next.phone) params.set("telefon", "1");
    else params.delete("telefon");
    if (next.flipped) params.set("vand", "1");
    else params.delete("vand");
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
  };
  const { variant, phone, flipped } = settings;
  const name = VARIANTS.find(({ key }) => key === variant)?.name;
  const active = { background: "#ff2fb4", color: "#000", boxShadow: "inset 0 0 0 2px #000" };

  return (
    <div className={phone ? "sgp-page sgp-page--phone" : "sgp-page"}>
      <div className="sgp-intro">
        <p>
          <strong>PROTOTYP (B1/B2) · Starta-grinden</strong> · variant{" "}
          <strong>
            {variant.toUpperCase()} ({name})
          </strong>{" "}
          · {phone ? "telefon, 390 px" : "dator, 56rem som appen"}
        </p>
        <p>
          Byt variant med pilarna i den rosa listen (eller ← →). <em>NU</em> är dagens grind som
          jämförelse. A, B och C har den kortare Tidspress-texten och "‹ Tillbaka" uppe till vänster
          (bara fri resa; resplanen har ingen väg tillbaka). <em>Vänd laddning</em> växlar alla
          tillstånd mellan laddar och klar, så att bytet inne i knappen syns.
        </p>
        <p>
          Bara Tidspress och Tidtagning visar grinden (<code>opensAtStarta</code>); Standard och
          Obegränsad börjar direkt, så de saknas här. Alla grindar är därför på klockan och visar
          tidsnoten.
        </p>
      </div>
      {STATES.map((state, index) => (
        <Stage
          // oxlint-disable-next-line react/no-array-index-key -- a fixed list.
          key={index}
          state={state}
          number={index + 1}
          variant={variant}
          flipped={flipped}
        />
      ))}
      <PrototypeSwitcher
        variants={VARIANTS}
        current={variant}
        onChange={(key) => update({ variant: key as VariantKey })}
      >
        <button
          type="button"
          style={{ ...pill, ...(phone ? active : {}) }}
          aria-pressed={phone}
          onClick={() => update({ phone: !phone })}
        >
          Telefon 390px
        </button>
        <button
          type="button"
          style={{ ...pill, ...(flipped ? active : {}) }}
          aria-pressed={flipped}
          onClick={() => update({ flipped: !flipped })}
        >
          Vänd laddning
        </button>
      </PrototypeSwitcher>
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <StartGatePrototype />
    </StrictMode>,
  );
}
