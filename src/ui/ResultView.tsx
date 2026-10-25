import {
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Game, GameReview } from "../engine/game";
import { routeStops } from "../engine/routeStops";
import { type GraphVersion, type KommunCode, kommunName } from "../graph/graphVersion";
import { SatelliteMap } from "../map/SatelliteMap";
import { emojiLine } from "../progress/history";
import type { Stats } from "../progress/stats";
import { type KeyValueStorage, readJson, writeJson } from "../progress/storage";
import { balancedRows } from "./balancedRows";
import { CloseIcon } from "./CloseIcon";
import { countdownToMidnight } from "./countdown";
import { resultOutcome } from "./messages";
import { StatsPanel } from "./StatsPanel";
import "./ResultView.css";

type ResultViewProps = {
  graph: GraphVersion;
  game: Game;
  review: GameReview;
  /** Heads the result in place of the daily outcome, such as a free-play headline. */
  headline?: string;
  /** What the screen around the board adds beside the outcome, such as sharing. */
  actions?: ReactNode;
  /** Adds the Statistik tab. */
  stats?: Stats;
  /** Where the chosen tab is kept for the rest of the browser session. */
  sessionStorage: KeyValueStorage;
  onClose?: () => void;
  /** Moves focus to the heading when the view opens, for keyboard and screen reader users. */
  focusOnOpen?: boolean;
};

/**
 * Opens when the game ends: a header with the outcome, the emoji line and the screen's actions,
 * over the tabs Min rutt (the cheapest route), Kortaste rutt and, given stats, Statistik.
 */
export function ResultView({
  graph,
  game,
  review,
  headline,
  actions,
  stats,
  sessionStorage,
  onClose,
  focusOnOpen = false,
}: ResultViewProps) {
  const tabs = stats ? RESULT_TABS : RESULT_TABS.filter(({ id }) => id !== "stats");
  const [tab, setTab] = useState(() => readTab(sessionStorage, tabs));
  const chooseTab = (chosen: ResultTab) => {
    setTab(chosen);
    writeJson(sessionStorage, TAB_KEY, chosen);
  };
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusOnOpen) heading.current?.focus();
  }, [focusOnOpen]);
  const outcome = headline ?? resultOutcome(review);
  const { cheapestRoute, shortestRoute } = review;
  // Both route maps share one framing, so switching tabs doesn't move the map.
  const frame = useMemo(
    () => [...new Set([...(cheapestRoute ?? []), ...(shortestRoute ?? [])])],
    [cheapestRoute, shortestRoute],
  );

  return (
    <section className="result-view" aria-labelledby="result-heading">
      <header className="result-header">
        <h2 id="result-heading" ref={heading} tabIndex={-1} className="result-outcome">
          {outcome}
        </h2>
        {onClose && (
          <button
            type="button"
            className="result-close"
            aria-label="Stäng resultat"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        )}

        <p className="result-emoji" aria-label={`Gissningar: ${emojiLine(review.cards)}`}>
          {emojiLine(review.cards)}
        </p>

        {actions && <div className="result-actions">{actions}</div>}
      </header>

      <ResultTabs tabs={tabs} selected={tab} onSelect={chooseTab} />
      {tabs.map(({ id }) => (
        <div
          key={id}
          id={panelId(id)}
          role="tabpanel"
          aria-labelledby={tabId(id)}
          className="result-panel"
          hidden={id !== tab}
        >
          {id === tab && id === "mine" && cheapestRoute && (
            <RoutePanel
              graph={graph}
              game={game}
              review={review}
              route={cheapestRoute}
              label="Bästa vägen med dina gissningar"
              frame={frame}
            />
          )}
          {id === tab && id === "shortest" && shortestRoute && (
            <>
              {cheapestRoute?.length === shortestRoute.length && (
                <p className="result-note">Din rutt var en av de kortaste!</p>
              )}
              <RoutePanel
                graph={graph}
                game={game}
                review={review}
                route={shortestRoute}
                label="Kortaste rutten"
                frame={frame}
              />
            </>
          )}
          {id === tab && id === "stats" && stats && <StatsPanel stats={stats} hideHeading />}
        </div>
      ))}
    </section>
  );
}

type ResultStripProps = {
  review: GameReview;
  /** Heads the strip in place of the daily outcome, such as a free-play headline. */
  headline?: string;
  /** What the screen around the board adds before Visa resultat, such as sharing. */
  actions?: ReactNode;
  onOpen: () => void;
  openButtonRef?: Ref<HTMLButtonElement>;
};

/** The result view collapsed to one row over the board: the outcome, the actions and Visa resultat. */
export function ResultStrip({
  review,
  headline,
  actions,
  onOpen,
  openButtonRef,
}: ResultStripProps) {
  return (
    <div className="result-strip">
      <p className="result-outcome">{headline ?? resultOutcome(review)}</p>
      <div className="result-actions">
        {actions}
        <button ref={openButtonRef} type="button" className="result-reopen" onClick={onOpen}>
          Visa resultat <span aria-hidden="true">›</span>
        </button>
      </div>
    </div>
  );
}

const TAB_KEY = "akle:result-tab";

const RESULT_TABS = [
  { id: "mine", name: "Min rutt" },
  { id: "shortest", name: "Kortaste rutt" },
  { id: "stats", name: "Statistik" },
] as const;

type ResultTab = (typeof RESULT_TABS)[number]["id"];
type ResultTabList = readonly (typeof RESULT_TABS)[number][];

function readTab(storage: KeyValueStorage, tabs: ResultTabList): ResultTab {
  const stored = readJson(storage, TAB_KEY);
  return tabs.find(({ id }) => id === stored)?.id ?? "mine";
}

const tabId = (tab: ResultTab) => `result-tab-${tab}`;
const panelId = (tab: ResultTab) => `result-panel-${tab}`;

/** The tab row, following the WAI-ARIA tabs pattern: arrow keys, Home and End move between tabs. */
function ResultTabs({
  tabs,
  selected,
  onSelect,
}: {
  tabs: ResultTabList;
  selected: ResultTab;
  onSelect: (tab: ResultTab) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const moveTo = (index: number) => {
    const count = tabs.length;
    const target = tabs[(index + count) % count];
    if (!target) return;
    onSelect(target.id);
    list.current?.querySelector<HTMLElement>(`#${tabId(target.id)}`)?.focus();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const current = tabs.findIndex(({ id }) => id === selected);
    const next = {
      ArrowRight: current + 1,
      ArrowLeft: current - 1,
      Home: 0,
      End: tabs.length - 1,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    moveTo(next);
  };

  return (
    <div
      ref={list}
      role="tablist"
      aria-label="Resultat"
      className="result-tabs"
      onKeyDown={onKeyDown}
    >
      {tabs.map(({ id, name }) => (
        <button
          key={id}
          type="button"
          role="tab"
          id={tabId(id)}
          aria-selected={id === selected}
          aria-controls={panelId(id)}
          tabIndex={id === selected ? 0 : -1}
          onClick={() => onSelect(id)}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

type RoutePanelProps = {
  graph: GraphVersion;
  game: Game;
  review: GameReview;
  route: KommunCode[];
  /** Names the map and the list of stops for screen readers. */
  label: string;
  frame: readonly KommunCode[];
};

/** A route tab: the route on the map and as a line of stops, guessed or missed. */
function RoutePanel({ graph, game, review, route, label, frame }: RoutePanelProps) {
  const guessed = useMemo(() => new Set(game.guesses), [game.guesses]);
  const mapRoute = useMemo(() => ({ kommuner: route, label, frame }), [route, label, frame]);
  return (
    <>
      <SatelliteMap
        graph={graph}
        trip={game.trip}
        cards={review.cards}
        route={mapRoute}
        allOutlines
      />
      <RouteLine
        stops={routeStops(game.trip, route, guessed)}
        label={label}
        nameOf={(code) => kommunName(graph, code)}
      />
    </>
  );
}

/** Must match the stop width in ResultView.css. */
const STOP_WIDTH_REM = 5.75;

type RouteLineProps = {
  stops: ReturnType<typeof routeStops>;
  label: string;
  nameOf: (code: string) => string;
};

/**
 * The route as a line of stops. When it doesn't fit on one row, the stops are split so every row
 * holds an equal share. Each stop spans two half-width grid tracks, so shorter rows can be centred.
 */
function RouteLine({ stops, label, nameOf }: RouteLineProps) {
  const list = useRef<HTMLOListElement>(null);
  const [fitPerRow, setFitPerRow] = useState(stops.length);

  useEffect(() => {
    const element = list.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      setFitPerRow(entry.contentRect.width / (STOP_WIDTH_REM * rem));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const rows = balancedRows(stops.length, fitPerRow);
  const columns = rows[0] ?? 1;
  const placements = rows.flatMap((length, row) =>
    Array.from({ length }, (_, position) => ({
      gridRow: row + 1,
      gridColumn: `${columns - length + 2 * position + 1} / span 2`,
    })),
  );

  return (
    <ol
      ref={list}
      aria-label={label}
      className="result-route"
      style={{ gridTemplateColumns: `repeat(${2 * columns}, minmax(0, ${STOP_WIDTH_REM / 2}rem))` }}
    >
      {stops.map(({ code, kind }, index) => (
        <li key={code} className={`stop-${kind}`} style={placements[index]}>
          {nameOf(code)}
          {kind === "guessed" && <span className="visually-hidden"> (gissad)</span>}
          {kind === "missed" && <span className="visually-hidden"> (missad)</span>}
        </li>
      ))}
    </ol>
  );
}

/** The time left until the next daily trip, ticking every second from `from`. */
export function Countdown({ from }: { from: Date }) {
  const [offset] = useState(() => from.getTime() - Date.now());
  const [now, setNow] = useState(from);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date(Date.now() + offset)), 1000);
    return () => clearInterval(timer);
  }, [offset]);
  return <time className="countdown">{countdownToMidnight(now)}</time>;
}
