import { useEffect, useMemo, useState } from "react";
import type { Game, GameReview } from "../engine/game";
import { type GraphVersion, kommunName } from "../graph/graphVersion";
import { preferredShortestRoute } from "../graph/routes";
import { SatelliteMap } from "../map/SatelliteMap";
import { emojiLine } from "../progress/history";
import { countdownToMidnight } from "./countdown";
import { resultOutcome } from "./messages";
import "./ResultView.css";

type ResultViewProps = {
  graph: GraphVersion;
  game: Game;
  review: GameReview;
  now: Date;
  onClose?: () => void;
};

/** Opens when the game ends: the outcome, the emoji line, a shortest route and the countdown. */
export function ResultView({ graph, game, review, now, onClose }: ResultViewProps) {
  const { start, destination } = game.puzzle;
  const nameOf = (code: string) => kommunName(graph, code);
  const outcome = resultOutcome(review);
  const guessed = useMemo(() => new Set(game.guesses), [game.guesses]);
  const route = useMemo(
    () => preferredShortestRoute(graph, start, destination, guessed),
    [graph, start, destination, guessed],
  );

  return (
    <section
      className={`result-view result-${review.perfect ? "perfect" : review.status}`}
      aria-labelledby="result-heading"
    >
      <div role="alert">
        <h2 id="result-heading">{outcome?.headline}</h2>
        <p className="result-score">{outcome?.score}</p>
        {review.missing.length > 0 && (
          <p className="result-missing">Saknades: {review.missing.map(nameOf).join(", ")}</p>
        )}
      </div>

      <p className="result-emoji" aria-label={`Gissningar: ${emojiLine(review.cards)}`}>
        {emojiLine(review.cards)}
      </p>

      {route && (
        <>
          <SatelliteMap graph={graph} puzzle={game.puzzle} cards={review.cards} route={route} />
          <ol aria-label="Kortaste vägen" className="result-route">
            {route.map((code) => {
              const mark =
                code === start
                  ? "start"
                  : code === destination
                    ? "destination"
                    : guessed.has(code)
                      ? "guessed"
                      : "missed";
              return (
                <li key={code} className={`stop-${mark}`}>
                  {nameOf(code)}
                  {mark === "guessed" && <span className="visually-hidden"> (gissad)</span>}
                  {mark === "missed" && <span className="visually-hidden"> (missad)</span>}
                </li>
              );
            })}
          </ol>
        </>
      )}

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

function Countdown({ from }: { from: Date }) {
  const [offset] = useState(() => from.getTime() - Date.now());
  const [now, setNow] = useState(from);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date(Date.now() + offset)), 1000);
    return () => clearInterval(timer);
  }, [offset]);
  return <time className="countdown">{countdownToMidnight(now)}</time>;
}
