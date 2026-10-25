// PROTOTYPE (D3): throwaway. Never merge to main.
// Three variants of the free-play / itinerary result header (plus today's, as "nu"), each shown in
// every result state stacked on one page, switchable via `?variant=nu|a|b|c|d|e|f` and the pink bar.
// `?telefon=1` narrows each state to a 390 px phone; `?karta=0` hides the placeholder maps.
import { StrictMode, type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "../styles.css";
import "./ResultView.css";
import "./FreePlayScreen.css";
import "./ItineraryScreen.css";
import "./ResultHeaderPrototype.css";
import { CloseIcon } from "./CloseIcon";
import { pill, PrototypeSwitcher } from "./PrototypeSwitcher";

type ResultState = {
  caption: string;
  headline: string;
  marks: string;
  score: number;
  /** The label with the headline no longer repeated in it. */
  label: string;
  /** Today's label, for the "nu" variant. */
  oldLabel: string;
  time?: string;
  mode: string;
  from: string;
  to: string;
  collapsed?: boolean;
  itinerary?: { title: string; index: number; count: number; total: number };
};

const STATES: ResultState[] = [
  {
    caption: "Fri resa · Framme! +1 · Standard",
    headline: "Framme!",
    marks: "✅🟧✅✅",
    score: 1,
    label: "+1",
    oldLabel: "+1",
    mode: "Standard",
    from: "Sundsvall",
    to: "Östersund",
  },
  {
    caption: "Fri resa · Perfekt! · Tidtagning med tid",
    headline: "Perfekt!",
    marks: "✅✅✅",
    score: -1,
    label: "+0",
    oldLabel: "+0 (Perfekt)",
    time: "0:21,3",
    mode: "Tidtagning",
    from: "Lund",
    to: "Kristianstad",
  },
  {
    caption: "Fri resa · Framme! · Tidspress 15 s med 2 timeouts",
    headline: "Framme!",
    marks: "✅🟩✅✅",
    score: 3,
    label: "+1 (2 ⏱)",
    oldLabel: "+1 (2 ⏱)",
    mode: "Tidspress 15 s",
    from: "Uppsala",
    to: "Västerås",
  },
  {
    caption: "Fri resa · Gav upp · Obegränsad, 1 ifrån",
    headline: "Gav upp",
    marks: "✅🟧🟥✅🟧",
    score: 4,
    label: "1 ifrån",
    oldLabel: "Gav upp (1 ifrån)",
    mode: "Obegränsad",
    from: "Kiruna",
    to: "Arjeplog",
  },
  {
    caption: "Fri resa · Slut på gissningar · Standard, 2 ifrån (längsta rubriken)",
    headline: "Slut på gissningar",
    marks: "✅🟧🟥🟥✅🟧🟥",
    score: 7,
    label: "2 ifrån",
    oldLabel: "Slut på gissningar (2 ifrån)",
    mode: "Standard",
    from: "Strömstad",
    to: "Mariestad",
  },
  {
    caption: "Fri resa · hopfällt (efter ✕), Framme! +1 (1 ledtråd)",
    headline: "Framme!",
    marks: "✅🟧✅✅",
    score: 2,
    label: "+1 (1 ledtråd)",
    oldLabel: "+1 (1 ledtråd)",
    mode: "Standard",
    from: "Sundsvall",
    to: "Östersund",
    collapsed: true,
  },
  {
    caption: "Resplan · resa 1 av 3 · Framme! +1 (1 ledtråd)",
    headline: "Framme!",
    marks: "✅🟩✅✅",
    score: 2,
    label: "+1 (1 ledtråd)",
    oldLabel: "+1 (1 ledtråd)",
    mode: "Standard",
    from: "Gävle",
    to: "Falun",
    itinerary: { title: "Söndagsturen", index: 0, count: 3, total: 2 },
  },
  {
    caption: "Resplan · sista resan (3 av 3) · Perfekt! · Tidtagning",
    headline: "Perfekt!",
    marks: "✅✅",
    score: -1,
    label: "+0",
    oldLabel: "+0 (Perfekt)",
    time: "0:09,8",
    mode: "Tidtagning",
    from: "Borås",
    to: "Ulricehamn",
    itinerary: { title: "Söndagsturen", index: 2, count: 3, total: 4 },
  },
  {
    caption: "Resplan · hopfällt (efter ✕), resa 1 av 3",
    headline: "Framme!",
    marks: "✅🟩✅✅",
    score: 2,
    label: "+1 (1 ledtråd)",
    oldLabel: "+1 (1 ledtråd)",
    mode: "Standard",
    from: "Gävle",
    to: "Falun",
    collapsed: true,
    itinerary: { title: "Söndagsturen", index: 0, count: 3, total: 2 },
  },
];

const VARIANTS = [
  { key: "nu", name: "Idag" },
  { key: "a", name: "Kompakt" },
  { key: "b", name: "Poängkort" },
  { key: "c", name: "Två spalter" },
  { key: "d", name: "C + A:s telefonknappar" },
  { key: "e", name: "C med poängkort" },
  { key: "f", name: "C med lätta brickor" },
] as const;
type VariantKey = (typeof VARIANTS)[number]["key"];

const points = (score: number) => `${score < 0 ? `−${-score}` : score} poäng`;
const isLast = (state: ResultState) =>
  state.itinerary !== undefined && state.itinerary.index === state.itinerary.count - 1;
const nextLabel = (state: ResultState) =>
  isLast(state) ? "Visa sammanfattning →" : "Nästa resa →";

/* Shared bits. The real buttons' classes, so they look native. */

function Close() {
  return (
    <button type="button" className="result-close" aria-label="Stäng resultat">
      <CloseIcon />
    </button>
  );
}

/** "Lägre är bättre", tucked behind an ⓘ beside poäng. */
function ScoreInfo() {
  const [open, setOpen] = useState(false);
  return (
    <span className="rhp-info">
      <button
        type="button"
        className="rhp-info-button"
        aria-label="Om poäng"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        ⓘ
      </button>
      {open && (
        <span role="tooltip" className="rhp-info-pop">
          Lägre är bättre
        </span>
      )}
    </span>
  );
}

const Share = () => (
  <button type="button" className="share-button rhp-share">
    Dela resultat
  </button>
);
const SetupLink = ({ copy = "Ändra inställningar" }: { copy?: string }) => (
  <a
    href="#"
    className="free-play-setup-link rhp-setup"
    onClick={(event) => event.preventDefault()}
  >
    {copy}
  </a>
);
const Redraw = () => (
  <button type="button" className="free-play-redraw">
    Slumpa ny resa
  </button>
);
const NextTrip = ({ state, copy }: { state: ResultState; copy?: string }) => (
  <button type="button" className="itinerary-next rhp-next">
    {copy ?? nextLabel(state)}
  </button>
);
const Reopen = () => (
  <button type="button" className="result-reopen">
    Visa resultat <span aria-hidden="true">›</span>
  </button>
);
const Marks = ({ state, className }: { state: ResultState; className: string }) => (
  <p className={className} aria-label={`Gissningar: ${state.marks}`}>
    {state.marks}
  </p>
);

/* Nu: today's header, with the real classes and today's copy. */

function NowHeader({ state }: { state: ResultState }) {
  const scoreBlock = (
    <div className="result-score-block">
      <p className="result-score">
        {state.oldLabel} · {points(state.score)}
      </p>
      <p className="result-score-note">Lägre är bättre</p>
    </div>
  );
  return (
    <header className="result-header">
      <h2 className="result-outcome">{state.headline}</h2>
      <Close />
      <p className="result-emoji">{state.marks}</p>
      <div className="result-actions">
        {scoreBlock}
        {state.time && <p className="result-time">Tid {state.time}</p>}
        {state.itinerary ? (
          <>
            <p className="itinerary-total">Totalt {points(state.itinerary.total)}</p>
            <NextTrip state={state} copy={isLast(state) ? "Avsluta resplanen" : "Nästa resa"} />
          </>
        ) : (
          <>
            <div className="share">
              <Share />
            </div>
            <div className="free-play-next">
              <SetupLink copy="Välj läge och resa" />
              <Redraw />
            </div>
          </>
        )}
      </div>
    </header>
  );
}

function NowStrip({ state }: { state: ResultState }) {
  return (
    <div className="result-strip">
      <p className="result-outcome">{state.headline}</p>
      <div className="result-actions">
        <p className="result-score">
          {state.oldLabel} · {points(state.score)}
        </p>
        {state.time && <p className="result-time">Tid {state.time}</p>}
        {state.itinerary ? (
          <>
            <p className="itinerary-total">Totalt {points(state.itinerary.total)}</p>
            <NextTrip state={state} copy={isLast(state) ? "Avsluta resplanen" : "Nästa resa"} />
          </>
        ) : (
          <div className="share">
            <Share />
          </div>
        )}
        <Reopen />
      </div>
    </div>
  );
}

/* A: compact. One hero line, then one action row. */

function CompactHero({ state, strip = false }: { state: ResultState; strip?: boolean }) {
  return (
    <>
      {strip ? (
        <p className="result-outcome rhp-a-head">{state.headline}</p>
      ) : (
        <h2 className="result-outcome rhp-a-head">{state.headline}</h2>
      )}
      <p className="rhp-a-score">
        {points(state.score)}
        <ScoreInfo />
      </p>
      <p className="rhp-a-detail">
        {state.label}
        {state.time && <> · Tid {state.time}</>}
      </p>
      <Marks state={state} className="rhp-a-marks" />
    </>
  );
}

function CompactHeader({ state }: { state: ResultState }) {
  return (
    <header className="rhp-a">
      <div className="rhp-a-hero">
        <CompactHero state={state} />
        <span className="rhp-a-close">
          <Close />
        </span>
      </div>
      {state.itinerary ? (
        <div className="rhp-a-actions rhp-a-actions--trip">
          <p className="rhp-a-total">
            Resa {state.itinerary.index + 1} av {state.itinerary.count} ·{" "}
            <strong>Totalt {points(state.itinerary.total)}</strong>
          </p>
          <NextTrip state={state} />
        </div>
      ) : (
        <div className="rhp-a-actions">
          <Share />
          <span className="rhp-a-gap" />
          <SetupLink />
          <Redraw />
        </div>
      )}
    </header>
  );
}

function CompactStrip({ state }: { state: ResultState }) {
  return (
    <div className="result-strip rhp-a-strip">
      <div className="rhp-a-hero rhp-a-hero--strip">
        <CompactHero state={state} strip />
      </div>
      <div className="rhp-a-strip-actions">
        {state.itinerary ? <NextTrip state={state} /> : <Share />}
        <Reopen />
      </div>
    </div>
  );
}

/* B: score card. Headline and marks, then number tiles, then the actions. */

function Tiles({ state, small = false }: { state: ResultState; small?: boolean }) {
  return (
    <div className={small ? "rhp-b-tiles rhp-b-tiles--small" : "rhp-b-tiles"}>
      <div className="rhp-b-tile">
        <span className="rhp-b-num">{state.score < 0 ? `−${-state.score}` : state.score}</span>
        <span className="rhp-b-cap">
          poäng
          {!small && <ScoreInfo />}
        </span>
        {!small && <span className="rhp-b-sub">{state.label}</span>}
      </div>
      {state.time && (
        <div className="rhp-b-tile">
          <span className="rhp-b-num">{state.time}</span>
          <span className="rhp-b-cap">tid</span>
        </div>
      )}
      {state.itinerary && (
        <div className="rhp-b-tile rhp-b-tile--total">
          <span className="rhp-b-num">
            {state.itinerary.total < 0 ? `−${-state.itinerary.total}` : state.itinerary.total}
          </span>
          <span className="rhp-b-cap">totalt</span>
          {!small && (
            <span className="rhp-b-sub">
              resa {state.itinerary.index + 1}/{state.itinerary.count}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function CardHeader({ state }: { state: ResultState }) {
  return (
    <header className="rhp-b">
      <div className="rhp-b-top">
        <h2 className="result-outcome">{state.headline}</h2>
        <Marks state={state} className="rhp-b-marks" />
        <span className="rhp-b-close">
          <Close />
        </span>
      </div>
      <Tiles state={state} />
      <div className="rhp-b-actions">
        {state.itinerary ? (
          <NextTrip state={state} />
        ) : (
          <>
            <Share />
            <span className="rhp-b-gap" />
            <SetupLink />
            <Redraw />
          </>
        )}
      </div>
    </header>
  );
}

function CardStrip({ state }: { state: ResultState }) {
  return (
    <div className="result-strip rhp-b-strip">
      <p className="result-outcome">{state.headline}</p>
      <Tiles state={state} small />
      <div className="rhp-b-strip-actions">
        {state.itinerary ? <NextTrip state={state} /> : <Share />}
        <Reopen />
      </div>
    </div>
  );
}

/* C: two columns. The summary on the left, an equal-width button stack on the right. */

function ColumnsHeader({ state }: { state: ResultState }) {
  return (
    <header className="rhp-c">
      <div className="rhp-c-summary">
        <div className="rhp-c-top">
          <h2 className="result-outcome">{state.headline}</h2>
          <Marks state={state} className="rhp-c-marks" />
        </div>
        <p className="rhp-c-score">
          <strong>
            {points(state.score)}
            <ScoreInfo />
          </strong>
          <span className="rhp-c-label">{state.label}</span>
          {state.time && <span className="rhp-c-label">Tid {state.time}</span>}
        </p>
        {state.itinerary && (
          <p className="rhp-c-total">
            <strong>Totalt {points(state.itinerary.total)}</strong> · efter resa{" "}
            {state.itinerary.index + 1} av {state.itinerary.count}
          </p>
        )}
      </div>
      <span className="rhp-c-close">
        <Close />
      </span>
      <div className="rhp-c-buttons">
        {state.itinerary ? (
          <NextTrip state={state} />
        ) : (
          <>
            <Redraw />
            <SetupLink />
            <Share />
          </>
        )}
      </div>
    </header>
  );
}

function ColumnsStrip({ state }: { state: ResultState }) {
  return (
    <div className="result-strip rhp-c-strip">
      <div className="rhp-c-strip-summary">
        <p className="result-outcome">{state.headline}</p>
        <p className="rhp-c-score">
          <strong>{points(state.score)}</strong>
          <span className="rhp-c-label">{state.label}</span>
          {state.itinerary && (
            <span className="rhp-c-label">Totalt {points(state.itinerary.total)}</span>
          )}
        </p>
      </div>
      <div className="rhp-c-strip-buttons">
        {state.itinerary ? <NextTrip state={state} /> : <Share />}
        <Reopen />
      </div>
    </div>
  );
}

/*
 * D, E, F: mixes after the first round. C's two columns on a computer (the summary left, the
 * button stack right); on a phone A's arrangement with its equal-width two-column button grid.
 * D keeps A's score line, E puts in B's tiles, kept compact, and F keeps the plain score line but
 * adds small chips for the other numbers (the time, the itinerary total) only when there are any.
 */

function CompactTiles({ state }: { state: ResultState }) {
  return (
    <div className="rhp-m-tiles">
      <div className="rhp-m-tile">
        <span className="rhp-m-num">
          {state.score < 0 ? `−${-state.score}` : state.score}
          <span className="rhp-m-cap">
            poäng
            <ScoreInfo />
          </span>
        </span>
        <span className="rhp-m-sub">{state.label}</span>
      </div>
      {state.time && (
        <div className="rhp-m-tile">
          <span className="rhp-m-num">{state.time}</span>
          <span className="rhp-m-sub rhp-m-sub--muted">tid</span>
        </div>
      )}
      {state.itinerary && (
        <div className="rhp-m-tile rhp-m-tile--total">
          <span className="rhp-m-num">
            {state.itinerary.total < 0 ? `−${-state.itinerary.total}` : state.itinerary.total}
            <span className="rhp-m-cap">totalt</span>
          </span>
          <span className="rhp-m-sub rhp-m-sub--muted">
            resa {state.itinerary.index + 1}/{state.itinerary.count}
          </span>
        </div>
      )}
    </div>
  );
}

function Chips({ state }: { state: ResultState }) {
  if (!state.time && !state.itinerary) return null;
  return (
    <div className="rhp-m-chips">
      {state.time && (
        <span className="rhp-m-chip">
          Tid <strong>{state.time}</strong>
        </span>
      )}
      {state.itinerary && (
        <span className="rhp-m-chip rhp-m-chip--total">
          Totalt <strong>{points(state.itinerary.total)}</strong> · resa {state.itinerary.index + 1}
          /{state.itinerary.count}
        </span>
      )}
    </div>
  );
}

function MixedHeader({ state, kind }: { state: ResultState; kind: "d" | "e" | "f" }) {
  const scoreLine = kind !== "e";
  return (
    <header className={`rhp-m rhp-m--${kind}`}>
      <h2 className="result-outcome rhp-m-head">{state.headline}</h2>
      {scoreLine && (
        <p className="rhp-m-score">
          {points(state.score)}
          <ScoreInfo />
        </p>
      )}
      {/* Its own row on a phone; on a computer its two parts sit in the grid apart. */}
      <div className="rhp-m-line">
        <Marks state={state} className="rhp-m-marks" />
        {scoreLine && (
          <p className="rhp-m-detail">
            {state.label}
            {kind === "d" && state.time && <> · Tid {state.time}</>}
          </p>
        )}
      </div>
      {kind === "d" && state.itinerary && (
        <p className="rhp-m-total">
          <strong>Totalt {points(state.itinerary.total)}</strong> · efter resa{" "}
          {state.itinerary.index + 1} av {state.itinerary.count}
        </p>
      )}
      {kind === "e" && (
        <div className="rhp-m-extra">
          <CompactTiles state={state} />
        </div>
      )}
      {kind === "f" && (state.time || state.itinerary) && (
        <div className="rhp-m-extra">
          <Chips state={state} />
        </div>
      )}
      <span className="rhp-m-close">
        <Close />
      </span>
      <div className="rhp-m-buttons">
        {state.itinerary ? (
          <NextTrip state={state} />
        ) : (
          <>
            <Redraw />
            <SetupLink />
            <Share />
          </>
        )}
      </div>
    </header>
  );
}

function MixedStrip({ state }: { state: ResultState }) {
  return (
    <div className="result-strip rhp-a-strip">
      <div className="rhp-a-hero rhp-a-hero--strip">
        <CompactHero state={state} strip />
      </div>
      <div className="rhp-a-strip-actions">
        {state.itinerary ? <NextTrip state={state} /> : <Share />}
        <Reopen />
      </div>
    </div>
  );
}

const HEADERS: Record<VariantKey, (props: { state: ResultState }) => ReactNode> = {
  nu: NowHeader,
  a: CompactHeader,
  b: CardHeader,
  c: ColumnsHeader,
  d: (props) => <MixedHeader {...props} kind="d" />,
  e: (props) => <MixedHeader {...props} kind="e" />,
  f: (props) => <MixedHeader {...props} kind="f" />,
};
const STRIPS: Record<VariantKey, (props: { state: ResultState }) => ReactNode> = {
  nu: NowStrip,
  a: CompactStrip,
  b: CardStrip,
  c: ColumnsStrip,
  d: MixedStrip,
  e: CardStrip,
  f: MixedStrip,
};

/* One state on its board: the label, the Från/Till signs, the result (or strip) and the map. */

function Stage({
  state,
  number,
  variant,
  showMap,
}: {
  state: ResultState;
  number: number;
  variant: VariantKey;
  showMap: boolean;
}) {
  const device = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();
  useLayoutEffect(() => {
    const element = device.current;
    if (!element) return;
    const measure = () => {
      const top = element.querySelector<HTMLElement>(".result-view, .result-strip");
      const end = element.querySelector<HTMLElement>(".result-tabs");
      if (!top) return;
      const start = top.getBoundingClientRect().top;
      setHeight(Math.round((end ?? top).getBoundingClientRect()[end ? "top" : "bottom"] - start));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [variant]);

  const Header = HEADERS[variant];
  const Strip = STRIPS[variant];
  const trip = state.itinerary;
  const label = trip ? (
    <p className="trip-number itinerary-progress">
      {trip.title} · Resa {trip.index + 1} av {trip.count} · {state.mode}
      {/* Today the label also carries the running total; the variants show it only in the result. */}
      {variant === "nu" && <> · Totalt {points(trip.total)}</>}
    </p>
  ) : (
    <p className="trip-number">Fri resa · {state.mode}</p>
  );

  return (
    <section className="rhp-state">
      <p className="rhp-caption">
        <span>
          {number}. {state.caption}
        </span>
        {height !== undefined && (
          <span className="rhp-measure">
            {state.collapsed ? "remsa" : "huvud (till flikarna)"}: {height} px
          </span>
        )}
      </p>
      <div ref={device} className="rhp-device">
        <div className="play-screen">
          {label}
          <h2 id={`trip-heading-${number}`} className="rhp-trip-heading">
            <span>Från:</span> <strong className="sign sign--start">{state.from}</strong>{" "}
            <span>Till:</span> <strong className="sign sign--destination">{state.to}</strong>
          </h2>
          {state.collapsed ? (
            <>
              <Strip state={state} />
              {showMap && <div className="rhp-map satellite-map">kartan (spelbrädet)</div>}
            </>
          ) : (
            <section className="result-view rhp-result-view">
              <Header state={state} />
              <div role="tablist" aria-label="Resultat" className="result-tabs">
                <button type="button" role="tab" aria-selected="true">
                  Min rutt
                </button>
                <button type="button" role="tab" aria-selected="false">
                  Kortaste rutt
                </button>
              </div>
              {showMap && (
                <>
                  <div className="rhp-map satellite-map">kartan (Min rutt)</div>
                  <div className="rhp-route">rutten som hållplatser</div>
                </>
              )}
            </section>
          )}
        </div>
      </div>
    </section>
  );
}

function readParams() {
  const params = new URLSearchParams(window.location.search);
  const asked = params.get("variant")?.toLowerCase();
  const variant: VariantKey = VARIANTS.find(({ key }) => key === asked)?.key ?? "a";
  return { variant, phone: params.get("telefon") === "1", showMap: params.get("karta") !== "0" };
}

function ResultHeaderPrototype() {
  const [settings, setSettings] = useState(readParams);
  const update = (change: Partial<typeof settings>) => {
    const next = { ...settings, ...change };
    setSettings(next);
    const params = new URLSearchParams(window.location.search);
    params.set("variant", next.variant);
    if (next.phone) params.set("telefon", "1");
    else params.delete("telefon");
    if (next.showMap) params.delete("karta");
    else params.set("karta", "0");
    window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
  };
  const { variant, phone, showMap } = settings;
  const name = VARIANTS.find(({ key }) => key === variant)?.name;

  return (
    <div className={phone ? "rhp-page rhp-page--phone" : "rhp-page"}>
      <div className="rhp-intro">
        <p>
          <strong>PROTOTYP (D3) · resultatets huvud</strong> · variant{" "}
          <strong>
            {variant.toUpperCase()} ({name})
          </strong>{" "}
          · {phone ? "telefon, 390 px" : "dator, 56rem som appen"}
        </p>
        <p>
          Byt variant med pilarna i den rosa listen (eller ← →). <em>NU</em> är dagens huvud som
          jämförelse. A–F tappar rubriken ur förlust- och Perfekt-etiketterna, visar resplanens
          totalt bara en gång (inte i etiketten ovanför), och lägger "Lägre är bättre" bakom ⓘ vid
          poäng (klicka).
        </p>
        <p>
          Andra rundan: <strong>D</strong> = C:s två spalter på datorn, A:s knapprutnät på
          telefonen. <strong>E</strong> = D med kompakta poängkort. <strong>F</strong> = D med
          vanlig poängrad och små brickor bara för tid och totalt. Remsan (hopfällt) är A:s i D och
          F, B:s i E.
        </p>
        <p>
          Knapptexterna är <strong>arbetstitlar</strong>, inte bestämda: "Ändra inställningar" (idag
          "Välj läge och resa") och "Visa sammanfattning →" (idag "Avsluta resplanen"). Kartor och
          flikar är platshållare i verklig höjd, så att utrymmet syns.
        </p>
      </div>
      {STATES.map((state, index) => (
        <Stage
          // oxlint-disable-next-line react/no-array-index-key -- a fixed list.
          key={index}
          state={state}
          number={index + 1}
          variant={variant}
          showMap={showMap}
        />
      ))}
      <PrototypeSwitcher
        variants={VARIANTS}
        current={variant}
        onChange={(key) => update({ variant: key as VariantKey })}
      >
        <button
          type="button"
          style={{
            ...pill,
            ...(phone
              ? { background: "#ff2fb4", color: "#000", boxShadow: "inset 0 0 0 2px #000" }
              : {}),
          }}
          aria-pressed={phone}
          onClick={() => update({ phone: !phone })}
        >
          Telefon 390px
        </button>
        <button
          type="button"
          style={{
            ...pill,
            ...(showMap
              ? {}
              : { background: "#ff2fb4", color: "#000", boxShadow: "inset 0 0 0 2px #000" }),
          }}
          aria-pressed={!showMap}
          onClick={() => update({ showMap: !showMap })}
        >
          Dölj kartor
        </button>
      </PrototypeSwitcher>
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ResultHeaderPrototype />
    </StrictMode>,
  );
}
