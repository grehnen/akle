import { useEffect, useMemo, useRef, useState } from "react";
import type { Game, GameReview } from "../engine/game";
import { routeStops } from "../engine/routeStops";
import { type GraphVersion, kommunName } from "../graph/graphVersion";
import { SatelliteMap } from "../map/SatelliteMap";
import { emojiLine } from "../progress/history";
import type { Stats } from "../progress/stats";
import { balancedRows } from "./balancedRows";
import { countdownToMidnight } from "./countdown";
import { resultOutcome } from "./messages";
import { ShareButton } from "./ShareButton";
import { StatsPanel } from "./StatsPanel";
import "./ResultView.css";

type ResultViewProps = {
  graph: GraphVersion;
  game: Game;
  review: GameReview;
  now: Date;
  stats: Stats;
  shareText: string;
  onClose?: () => void;
  /** Moves focus to the heading when the view opens, for keyboard and screen reader users. */
  focusOnOpen?: boolean;
};

/** Opens when the game ends: the outcome, the emoji line, the cheapest route, the stats, sharing and the countdown. */
export function ResultView({
  graph,
  game,
  review,
  now,
  stats,
  shareText,
  onClose,
  focusOnOpen = false,
}: ResultViewProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusOnOpen) heading.current?.focus();
  }, [focusOnOpen]);
  const nameOf = (code: string) => kommunName(graph, code);
  const outcome = resultOutcome(review);
  const guessed = useMemo(() => new Set(game.guesses), [game.guesses]);
  const { cheapestRoute } = review;

  return (
    <section
      className={`result-view result-${review.perfect ? "perfect" : review.status}`}
      aria-labelledby="result-heading"
    >
      <h2 id="result-heading" ref={heading} tabIndex={-1}>
        {outcome?.headline}
      </h2>
      <p className="result-score">{outcome?.score}</p>
      {review.missing.length > 0 && (
        <p className="result-missing">Saknades: {review.missing.map(nameOf).join(", ")}</p>
      )}

      <p className="result-emoji" aria-label={`Gissningar: ${emojiLine(review.cards)}`}>
        {emojiLine(review.cards)}
      </p>

      {cheapestRoute && (
        <>
          <SatelliteMap
            graph={graph}
            puzzle={game.puzzle}
            cards={review.cards}
            cheapestRoute={cheapestRoute}
            allOutlines
          />
          <RouteLine stops={routeStops(game.puzzle, cheapestRoute, guessed)} nameOf={nameOf} />
        </>
      )}

      <StatsPanel stats={stats} />

      <ShareButton text={shareText} />

      <p className="result-countdown">
        Nästa pussel om <Countdown from={now} />
      </p>

      {onClose && (
        <button type="button" className="result-close" onClick={onClose}>
          Stäng
        </button>
      )}
    </section>
  );
}

/** Must match the stop width in ResultView.css. */
const STOP_WIDTH_REM = 5.75;

type RouteLineProps = {
  stops: ReturnType<typeof routeStops>;
  nameOf: (code: string) => string;
};

/**
 * The route as a line of stops. When it doesn't fit on one row, the stops are split so every row
 * holds an equal share. Each stop spans two half-width grid tracks, so shorter rows can be centred.
 */
function RouteLine({ stops, nameOf }: RouteLineProps) {
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
      aria-label="Bästa vägen med dina gissningar"
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

function Countdown({ from }: { from: Date }) {
  const [offset] = useState(() => from.getTime() - Date.now());
  const [now, setNow] = useState(from);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date(Date.now() + offset)), 1000);
    return () => clearInterval(timer);
  }, [offset]);
  return <time className="countdown">{countdownToMidnight(now)}</time>;
}
