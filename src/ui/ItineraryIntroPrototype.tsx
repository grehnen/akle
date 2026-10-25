// PROTOTYPE (G1/G2/I3): throwaway. Never merge to main.
// Four layouts of the itinerary intro's trip list (plus today's, as "nu"), switchable via
// `?variant=nu|a|b|c|d` and the pink bar. Every variant has the decided "Kopiera länk" left of
// "Starta resplanen" (with its toast) and the decided score instruction. `?lang=1` swaps in a 12-trip
// itinerary with a 40-character title; `?telefon=1` narrows the page to a 390 px phone;
// `?fel=1` makes the copy fail, to show the copy-by-hand field.
import { StrictMode, type ReactNode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "../styles.css";
import "./ResultView.css";
import "./ItineraryBuilder.css";
import "./ItineraryScreen.css";
import "./ItineraryIntroPrototype.css";
import type { ModeKind, ModeSetting } from "../freePlay/linkPayload";
import { SITE_URL } from "../siteUrl";
import { CopyFallback } from "./CopyFallback";
import { MODE_NAMES, modeName } from "./messages";
import { pill, PrototypeSwitcher } from "./PrototypeSwitcher";
import { RulesIcon } from "./RulesDialog";
import { StatsIcon } from "./StatsDialog";

/** The descriptions as decided: Tidspress's shortened (A3). */
const DESCRIPTIONS: Record<ModeKind, string> = {
  standard: "Som dagens resa: gissningarna räcker till avståndet och lite till.",
  unlimited: "Gissa hur många gånger du vill. Ge upp när du vill.",
  timed: "Varje gissning måste göras inom betänketiden. Varje gång tiden går ut kostar en poäng.",
  "tie-breaker": "Tiden tas. Vid lika poäng vinner den snabbaste.",
};

const HIDDEN_ENDS =
  "Start och mål visas resa för resa. Varje resa spelas en gång, i tur och ordning.";
// The user's decided wording, exactly.
const LOWER_IS_BETTER = "Lägre poäng är bättre.";
const SCORE_COSTS = "Perfekt ger −1; varje extra gissning, ledtråd och ⏱ kostar 1.";

type Itinerary = { title: string; trips: ModeSetting[] };

const SHORT: Itinerary = {
  title: "Söndagsturen",
  trips: [{ kind: "standard" }, { kind: "timed", thinkingTime: 15 }, { kind: "tie-breaker" }],
};

const LONG: Itinerary = {
  // 40 characters.
  title: "Från Smygehuk till Treriksröset, del två",
  trips: [
    { kind: "standard" },
    { kind: "standard" },
    { kind: "timed", thinkingTime: 15 },
    { kind: "tie-breaker" },
    { kind: "unlimited" },
    { kind: "timed", thinkingTime: 10 },
    { kind: "standard" },
    { kind: "tie-breaker" },
    { kind: "timed", thinkingTime: 30 },
    { kind: "unlimited" },
    { kind: "standard" },
    { kind: "tie-breaker" },
  ],
};

const LINK = "/resplan?namn=S%C3%B6ndagsturen&r=1.Ab3k-Xy9.Qz";

/** `Tidspress · 15 s`: the setting after the name, for the compact rows. */
function nameAndSetting(mode: ModeSetting): ReactNode {
  return mode.kind === "timed" ? (
    <>
      {MODE_NAMES.timed} <span className="iip-setting">· {mode.thinkingTime} s</span>
    </>
  ) : (
    MODE_NAMES[mode.kind]
  );
}

const MODE_GLYPH: Record<ModeKind, string> = {
  standard: "",
  unlimited: "∞",
  timed: "⏱",
  "tie-breaker": "⏲",
};

const VARIANTS = [
  { key: "nu", name: "dagens intro" },
  { key: "a", name: "kortrader med beskrivning" },
  { key: "b", name: "kompakta rader" },
  { key: "c", name: "rutnät av lägen" },
  { key: "d", name: "två spalter, tidslinje" },
] as const;
type VariantKey = (typeof VARIANTS)[number]["key"];

type IntroProps = { itinerary: Itinerary; failCopy: boolean };

/** The decided actions: Kopiera länk (toast above it, fallback below) left of Starta resplanen. */
function Actions({ failCopy, className = "" }: { failCopy: boolean; className?: string }) {
  const [toast, setToast] = useState("");
  const [fallback, setFallback] = useState(false);
  const start = useRef<HTMLButtonElement>(null);
  useEffect(() => start.current?.focus(), []);
  useEffect(() => {
    if (toast === "") return;
    const timer = setTimeout(() => setToast(""), 2000);
    return () => clearTimeout(timer);
  }, [toast]);
  const copy = () => {
    // A fake clipboard: the copy "works" unless the fel toggle says otherwise.
    if (failCopy) {
      setToast("Kunde inte kopiera");
      setFallback(true);
      return;
    }
    setToast("Kopierat!");
    // Fire and forget: the real clipboard may hang or refuse in an unfocused tab.
    void navigator.clipboard?.writeText(`${SITE_URL}${LINK}`).catch(() => undefined);
    setFallback(false);
  };
  return (
    <div className={`iip-actions-wrap ${className}`}>
      <div className="iip-actions">
        <div className="share iip-copy">
          {toast && (
            <span className="share-toast" role="status">
              {toast}
            </span>
          )}
          <button type="button" className="itinerary-copy" onClick={copy}>
            Kopiera länk
          </button>
        </div>
        <button
          ref={start}
          type="button"
          className="itinerary-begin"
          onClick={() => setToast("(prototyp: resa 1 skulle starta här)")}
        >
          Starta resplanen
        </button>
      </div>
      {fallback && (
        <div className="iip-fallback">
          <CopyFallback url={`${SITE_URL}${LINK}`} onClose={() => setFallback(false)} />
        </div>
      )}
    </div>
  );
}

/** The decided score instruction (I3), the same words in every variant. */
function ScoreRule({ className = "" }: { className?: string }) {
  return (
    <p className={`iip-score-rule ${className}`}>
      <strong>{LOWER_IS_BETTER}</strong> {SCORE_COSTS}
    </p>
  );
}

/** Today's intro, as shipped, plus only the decided additions (copy link, lower is better). */
function IntroNow({ itinerary, failCopy }: IntroProps) {
  return (
    <section className="itinerary-intro" aria-labelledby="itinerary-intro-heading">
      <h2 id="itinerary-intro-heading">{itinerary.title}</h2>
      <p className="itinerary-intro-count">{itinerary.trips.length} resor</p>
      <ol className="itinerary-intro-trips" aria-label="Resornas lägen">
        {itinerary.trips.map((trip, index) => (
          // oxlint-disable-next-line react/no-array-index-key -- a fixed list.
          <li key={index}>{modeName(trip)}</li>
        ))}
      </ol>
      <p className="itinerary-intro-note">{HIDDEN_ENDS}</p>
      <ScoreRule />
      <Actions failCopy={failCopy} />
    </section>
  );
}

function ListHeader({ count }: { count: number }) {
  return (
    <div className="iip-list-header">
      <h3>Resor</h3>
      <span>{count}</span>
    </div>
  );
}

/** A: numbered card rows, mode bold and its description muted, under "Resor · 3". */
function IntroA({ itinerary, failCopy }: IntroProps) {
  return (
    <section className="itinerary-intro iip-wide" aria-labelledby="itinerary-intro-heading">
      <h2 id="itinerary-intro-heading">{itinerary.title}</h2>
      <p className="itinerary-intro-note">{HIDDEN_ENDS}</p>
      <ScoreRule />
      <div className="iip-list">
        <ListHeader count={itinerary.trips.length} />
        <ol className="iip-rows">
          {itinerary.trips.map((trip, index) => (
            // oxlint-disable-next-line react/no-array-index-key -- a fixed list.
            <li key={index} className="iip-row">
              <span className="iip-number">{index + 1}</span>
              <span className="iip-row-text">
                <strong>{modeName(trip)}</strong>
                <span className="iip-description">{DESCRIPTIONS[trip.kind]}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
      <Actions failCopy={failCopy} />
    </section>
  );
}

/** B: like A, but compact: the mode's name and setting only, no descriptions. */
function IntroB({ itinerary, failCopy }: IntroProps) {
  return (
    <section className="itinerary-intro iip-wide" aria-labelledby="itinerary-intro-heading">
      <h2 id="itinerary-intro-heading">{itinerary.title}</h2>
      <p className="itinerary-intro-note">{HIDDEN_ENDS}</p>
      <ScoreRule />
      <div className="iip-list">
        <ListHeader count={itinerary.trips.length} />
        <ol className="iip-rows iip-rows--compact">
          {itinerary.trips.map((trip, index) => (
            // oxlint-disable-next-line react/no-array-index-key -- a fixed list.
            <li key={index} className="iip-row">
              <span className="iip-number">{index + 1}</span>
              <strong className="iip-row-name">{nameAndSetting(trip)}</strong>
              <span className="iip-glyph" aria-hidden="true">
                {MODE_GLYPH[trip.kind]}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <Actions failCopy={failCopy} />
    </section>
  );
}

/** C: tiles in a grid on a computer (3 columns, wrapping), a stack on a phone. */
function IntroC({ itinerary, failCopy }: IntroProps) {
  return (
    <section className="itinerary-intro iip-wider" aria-labelledby="itinerary-intro-heading">
      <h2 id="itinerary-intro-heading">{itinerary.title}</h2>
      <p className="itinerary-intro-note">{HIDDEN_ENDS}</p>
      <ScoreRule />
      <div className="iip-list">
        <ListHeader count={itinerary.trips.length} />
        <ol className="iip-tiles">
          {itinerary.trips.map((trip, index) => (
            // oxlint-disable-next-line react/no-array-index-key -- a fixed list.
            <li key={index} className="iip-tile">
              <span className="iip-tile-top">
                <span className="iip-tile-number">Resa {index + 1}</span>
                <span className="iip-glyph" aria-hidden="true">
                  {MODE_GLYPH[trip.kind]}
                </span>
              </span>
              <strong>{nameAndSetting(trip)}</strong>
              <span className="iip-description">{DESCRIPTIONS[trip.kind]}</span>
            </li>
          ))}
        </ol>
      </div>
      <Actions failCopy={failCopy} />
    </section>
  );
}

/**
 * D: two columns on a computer: the itinerary's title, rules and actions on the left (sticky), the
 * trips as a route timeline on the right, each mode's rules said once in a legend under it rather
 * than on every row. On a phone it's one column, the actions last.
 */
function IntroD({ itinerary, failCopy }: IntroProps) {
  const kinds = [...new Set(itinerary.trips.map((trip) => trip.kind))];
  return (
    <section className="iip-split" aria-labelledby="itinerary-intro-heading">
      <div className="iip-split-side">
        <p className="iip-eyebrow">Resplan · {itinerary.trips.length} resor</p>
        <h2 id="itinerary-intro-heading">{itinerary.title}</h2>
        <p className="itinerary-intro-note">{HIDDEN_ENDS}</p>
        <ScoreRule className="iip-score-rule--left" />
        <Actions failCopy={failCopy} className="iip-actions-wrap--side" />
      </div>
      <div className="iip-split-main">
        <ol className="iip-timeline" aria-label="Resornas lägen">
          {itinerary.trips.map((trip, index) => (
            // oxlint-disable-next-line react/no-array-index-key -- a fixed list.
            <li key={index} className={`iip-stop iip-stop--${trip.kind}`}>
              <span className="iip-stop-dot">{index + 1}</span>
              <strong>{nameAndSetting(trip)}</strong>
              <span className="iip-stop-ends" aria-hidden="true">
                ? → ?
              </span>
            </li>
          ))}
        </ol>
        <dl className="iip-legend">
          {kinds.map((kind) => (
            <div key={kind}>
              <dt>
                <span className={`iip-legend-dot iip-stop--${kind}`} aria-hidden="true" />
                {MODE_NAMES[kind]}
              </dt>
              <dd>{DESCRIPTIONS[kind]}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

const INTROS: Record<VariantKey, (props: IntroProps) => ReactNode> = {
  nu: IntroNow,
  a: IntroA,
  b: IntroB,
  c: IntroC,
  d: IntroD,
};

/** The site header, as the real one renders on /resplan, for scale and context. */
function SiteHeader() {
  return (
    <header className="site-header">
      <button type="button" className="header-button rules-open" aria-label="Så spelar du">
        <RulesIcon />
      </button>
      <button type="button" className="header-button stats-open" aria-label="Visa statistik">
        <StatsIcon />
      </button>
      <h1>
        <a href="/">Åkle</a>
      </h1>
      <a
        className="header-button itinerary-open"
        aria-label="Resplan"
        aria-current="page"
        href="/resplan"
      >
        <span aria-hidden="true">🗺</span>
      </a>
      <a className="header-button free-play-open" aria-label="Fri resa" href="/fri">
        <span aria-hidden="true">🎲</span>
      </a>
    </header>
  );
}

function readParams() {
  const params = new URLSearchParams(window.location.search);
  const asked = params.get("variant")?.toLowerCase();
  const variant: VariantKey = VARIANTS.find(({ key }) => key === asked)?.key ?? "a";
  return {
    variant,
    phone: params.get("telefon") === "1",
    long: params.get("lang") === "1",
    failCopy: params.get("fel") === "1",
  };
}

function ItineraryIntroPrototype() {
  const [settings, setSettings] = useState(readParams);
  const update = (change: Partial<typeof settings>) => {
    const next = { ...settings, ...change };
    setSettings(next);
    const params = new URLSearchParams();
    params.set("variant", next.variant);
    if (next.phone) params.set("telefon", "1");
    if (next.long) params.set("lang", "1");
    if (next.failCopy) params.set("fel", "1");
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
  };
  const { variant, phone, long, failCopy } = settings;
  const name = VARIANTS.find(({ key }) => key === variant)?.name;
  const Intro = INTROS[variant];
  const itinerary = long ? LONG : SHORT;
  const active = { background: "#ff2fb4", color: "#000", boxShadow: "inset 0 0 0 2px #000" };
  const toggle = (label: string, on: boolean, change: () => void) => (
    <button
      type="button"
      style={{ ...pill, whiteSpace: "nowrap", ...(on ? active : {}) }}
      aria-pressed={on}
      onClick={change}
    >
      {label}
    </button>
  );

  return (
    <div className={phone ? "iip-page iip-page--phone" : "iip-page"}>
      <p className="iip-banner">
        PROTOTYP (G2) · resplanens intro · {variant.toUpperCase()} ({name}) ·{" "}
        {long ? "12 resor" : "3 resor"} · {phone ? "telefon 390 px" : "dator"}
        {failCopy && " · kopiering misslyckas"}
      </p>
      <main key={`${variant}-${long}-${failCopy}`}>
        <SiteHeader />
        <Intro itinerary={itinerary} failCopy={failCopy} />
      </main>
      <PrototypeSwitcher
        variants={VARIANTS}
        current={variant}
        onChange={(key) => update({ variant: key as VariantKey })}
      >
        {toggle("Telefon 390px", phone, () => update({ phone: !phone }))}
        {toggle("12 resor", long, () => update({ long: !long }))}
        {toggle("Kopiering fel", failCopy, () => update({ failCopy: !failCopy }))}
      </PrototypeSwitcher>
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ItineraryIntroPrototype />
    </StrictMode>,
  );
}
