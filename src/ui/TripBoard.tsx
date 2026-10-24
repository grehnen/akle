import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { type Game, reviewGame, type Trip } from "../engine/game";
import { hintReveals } from "../engine/hints";
import { resolveKommunName } from "../engine/kommunNames";
import { type GraphVersion, kommunName } from "../graph/graphVersion";
import { SatelliteMap } from "../map/SatelliteMap";
import type { Stats } from "../progress/stats";
import type { KeyValueStorage } from "../progress/storage";
import { GuessInput } from "./GuessInput";
import { HintSection } from "./HintSection";
import {
  applyGuessInput,
  enterTarget,
  type GuessSession,
  suggestKommuner,
  takeSessionHint,
} from "./guessSession";
import { guessCardText } from "./messages";
import { ResultStrip, ResultView } from "./ResultView";
import { UsedCounter } from "./UsedCounter";

type TripBoardProps<T extends Trip> = {
  graph: GraphVersion;
  /** The game being played; the screen around the board holds it, to save or share it. */
  game: Game<T>;
  onGameChange: (game: Game<T>) => void;
  /** Where view choices that last one browser session are kept, such as the result tab. */
  sessionStorage: KeyValueStorage;
  /** Shown with the heading, such as `Dagens resa #21`. */
  label?: ReactNode;
  /** Added beside the outcome in the result view, such as the countdown and sharing. */
  resultActions?: ReactNode;
  /** Added to the collapsed result strip, such as sharing. */
  stripActions?: ReactNode;
  /** Adds the Statistik tab to the result view. */
  stats?: Stats;
  /** Whether the finished game's result starts collapsed, as the screen remembers it. */
  resultClosed?: boolean;
  onResultClosedChange?: (closed: boolean) => void;
  /** Links put in the footer before the data credits, such as Rapportera fel. */
  footerLinks?: ReactNode;
};

/**
 * Plays one trip: the heading, the map, the guess input, the past guesses, the hints and, once
 * the game ends, the result view with Min rutt and Kortaste rutt. Whatever only one kind of trip
 * needs, such as saving, history or a trip number, the screen around it passes in.
 */
export function TripBoard<T extends Trip>({
  graph,
  game,
  onGameChange,
  sessionStorage,
  label,
  resultActions,
  stripActions,
  stats,
  resultClosed: initiallyClosed = false,
  onResultClosedChange,
  footerLinks,
}: TripBoardProps<T>) {
  const [input, setInput] = useState<Omit<GuessSession<T>, "game">>({ text: "" });
  const { toast, announcement } = input;
  const update = (change: (session: GuessSession<T>) => GuessSession<T>) => {
    const { game: nextGame, ...nextInput } = change({ ...input, game });
    setInput(nextInput);
    if (nextGame !== game) onGameChange(nextGame);
  };
  const session = { ...input, game };
  const { trip } = game;

  const review = useMemo(() => reviewGame(graph, game), [graph, game]);
  const reveals = useMemo(() => hintReveals(graph, game), [graph, game]);
  const finished = review.status !== "playing";
  // A game finished just now keeps the board up for a moment, so the last guess is seen landing.
  const [boardLingered, setBoardLingered] = useState(finished);
  useEffect(() => {
    if (!finished || boardLingered) return;
    const timer = setTimeout(() => setBoardLingered(true), FINISH_LINGER_MS);
    return () => clearTimeout(timer);
  }, [finished, boardLingered]);
  const settled = finished && boardLingered;
  // Focus follows the result view when it opens or closes by the player's hand, not on reload.
  const [resultToggled, setResultToggled] = useState(false);
  const [resultClosed, setResultClosed] = useState(initiallyClosed);
  const closeResult = (closed: boolean) => {
    setResultToggled(true);
    setResultClosed(closed);
    onResultClosedChange?.(closed);
  };
  const showResult = settled && !resultClosed;
  const reopenButton = useRef<HTMLButtonElement>(null);
  const guessInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (resultClosed && resultToggled) reopenButton.current?.focus();
  }, [resultClosed, resultToggled]);
  const nameOf = (code: string) => kommunName(graph, code);

  return (
    <section className="play-screen" aria-labelledby="trip-heading">
      {label}
      <h2 id="trip-heading">
        Res från <strong className="sign sign--start">{nameOf(trip.start)}</strong> till{" "}
        <strong className="sign sign--destination">{nameOf(trip.destination)}</strong>
      </h2>

      {showResult && (
        <ResultView
          graph={graph}
          game={game}
          review={review}
          actions={resultActions}
          stats={stats}
          sessionStorage={sessionStorage}
          onClose={() => closeResult(true)}
          focusOnOpen={resultToggled || announcement !== undefined}
        />
      )}

      {settled && !showResult && (
        <ResultStrip
          review={review}
          actions={stripActions}
          onOpen={() => closeResult(false)}
          openButtonRef={reopenButton}
        />
      )}

      {/* The board steps aside while the result view is open; closing it brings the board back. */}
      {!showResult && (
        <>
          <SatelliteMap
            graph={graph}
            trip={trip}
            cards={review.cards}
            hintOutlines={reveals.outlines}
            initials={reveals.initials}
            allOutlines={settled}
          />

          <GuessInput
            text={input.text}
            exactMatch={resolveKommunName(graph, input.text) !== undefined}
            suggestions={suggestKommuner(graph, game, input.text)}
            highlighted={enterTarget(graph, session)}
            counter={<UsedCounter label="Gissa" used={review.cards.length} limit={review.limit} />}
            onEvent={(event) => update((current) => applyGuessInput(graph, current, event))}
            inputRef={guessInput}
          />

          <p role="alert" className="toast">
            {toast}
          </p>
        </>
      )}

      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>

      {!showResult && (
        <>
          <section className="past-guesses" aria-labelledby="guesses-heading">
            <h3 id="guesses-heading" className="section-heading">
              Tidigare gissningar
            </h3>
            {review.cards.length === 0 && (
              <p className="section-empty">
                Inga gissningar än. Börja med en granne till {nameOf(trip.start)}.
              </p>
            )}
            <ol aria-label="Gissningar">
              {review.cards.map((card, index) => (
                <li key={card.code}>
                  <span aria-hidden="true">
                    {card.feedback} {nameOf(card.code)}
                  </span>
                  <span className="visually-hidden">
                    {guessCardText(card, { number: index + 1, name: nameOf(card.code) })}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          {!finished && (
            <HintSection
              hintsUsed={review.hintsUsed}
              onTakeHint={() => update((current) => takeSessionHint(graph, current))}
              focusAfterLastHint={guessInput}
            />
          )}
        </>
      )}

      <footer className="credits">
        {footerLinks}
        <p>
          Kommungränser och grannar bygger på data från{" "}
          <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a> och är
          licensierade under ODbL.
        </p>
      </footer>
    </section>
  );
}

const FINISH_LINGER_MS = 1500;
