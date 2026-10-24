import { Fragment, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { type Game, giveUp, reviewGame, type Trip } from "../engine/game";
import { hintReveals } from "../engine/hints";
import { resolveKommunName } from "../engine/kommunNames";
import { type GraphVersion, kommunName } from "../graph/graphVersion";
import { SatelliteMap } from "../map/SatelliteMap";
import type { Stats } from "../progress/stats";
import type { KeyValueStorage } from "../progress/storage";
import { GiveUp } from "./GiveUp";
import { GuessCounter } from "./GuessCounter";
import { GuessInput } from "./GuessInput";
import { HintSection } from "./HintSection";
import {
  applyGuessInput,
  enterTarget,
  type GuessSession,
  suggestKommuner,
  takeSessionHint,
} from "./guessSession";
import { guessCardText, timeoutsText } from "./messages";
import { ResultStrip, ResultView } from "./ResultView";

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
  /** Shown above the guess input while the board is up, such as a trip's running clock. */
  clock?: ReactNode;
  /** Puts focus in the guess input as the board opens, as after `Starta`. */
  focusGuessOnOpen?: boolean;
  /**
   * A timed trip's timeouts, as runs: before each guess, then since the last one (`timeoutRuns`).
   * Each run shows as one ⏱ row among the guesses.
   */
  timeouts?: readonly number[];
};

/**
 * Plays one trip: the heading, the map, the guess input, the past guesses, the hints (with Ge upp
 * when the rules allow giving up) and, once
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
  clock,
  focusGuessOnOpen = false,
  timeouts,
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
  const [focusGuess] = useState(focusGuessOnOpen);
  useEffect(() => {
    if (focusGuess) guessInput.current?.focus();
  }, [focusGuess]);
  const nameOf = (code: string) => kommunName(graph, code);

  return (
    <section className="play-screen" aria-labelledby="trip-heading">
      {label}
      <h2 id="trip-heading">
        <span>Från:</span> <strong className="sign sign--start">{nameOf(trip.start)}</strong>{" "}
        <span>Till:</span>{" "}
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

          {clock}

          <GuessInput
            text={input.text}
            exactMatch={resolveKommunName(graph, input.text) !== undefined}
            suggestions={suggestKommuner(graph, game, input.text)}
            highlighted={enterTarget(graph, session)}
            counter={
              <GuessCounter
                label="Gissa"
                made={review.cards.length}
                limit={review.limit}
                over={finished}
              />
            }
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
            {review.cards.length === 0 && !timeouts?.some((run) => run > 0) && (
              <p className="section-empty">
                Inga gissningar än. Börja med en granne till {nameOf(trip.start)}.
              </p>
            )}
            <ol aria-label="Gissningar">
              {review.cards.map((card, index) => (
                <Fragment key={card.code}>
                  <TimeoutRow timeouts={timeouts?.[index]} />
                  <li>
                    <span aria-hidden="true">
                      {index + 1}. {nameOf(card.code)} {card.feedback}
                    </span>
                    <span className="visually-hidden">
                      {guessCardText(card, { number: index + 1, name: nameOf(card.code) })}
                    </span>
                  </li>
                </Fragment>
              ))}
              <TimeoutRow timeouts={timeouts?.[review.cards.length]} />
            </ol>
          </section>

          {!finished && (
            <HintSection
              hintsUsed={review.hintsUsed}
              onTakeHint={() => update((current) => takeSessionHint(graph, current))}
              focusAfterLastHint={guessInput}
            >
              {game.rules.giveUp && (
                <GiveUp
                  enabled={review.canGiveUp}
                  onGiveUp={() =>
                    update((current) => ({
                      ...current,
                      game: giveUp(graph, current.game),
                      announcement: "Du gav upp.",
                    }))
                  }
                />
              )}
            </HintSection>
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

/** Consecutive timeouts as one row among the guesses, `⏱ ×5`; not a guess, so not numbered. */
function TimeoutRow({ timeouts = 0 }: { timeouts?: number }) {
  if (timeouts === 0) return null;
  return (
    <li className="timeout-row">
      <span aria-hidden="true">⏱ ×{timeouts}</span>
      <span className="visually-hidden">{timeoutsText(timeouts)}</span>
    </li>
  );
}
