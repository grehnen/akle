import { useEffect, useMemo, useRef, useState } from "react";
import { resolveKommunName } from "../engine/kommunNames";
import { type Trip, reviewGame } from "../engine/game";
import { hintReveals } from "../engine/hints";
import { type GraphVersion, kommunName } from "../graph/graphVersion";
import { SatelliteMap } from "../map/SatelliteMap";
import { readHistory, recordFinishedGame, withFinishedGame } from "../progress/history";
import { gameOutcome } from "../progress/outcome";
import { loadSavedGame, saveGame } from "../progress/savedGame";
import { shareText } from "../progress/shareText";
import { deriveStats } from "../progress/stats";
import { type KeyValueStorage, readJson, writeJson } from "../progress/storage";
import { GuessInput } from "./GuessInput";
import { HintSection } from "./HintSection";
import {
  applyGuessInput,
  type GuessSession,
  enterTarget,
  suggestKommuner,
  takeSessionHint,
} from "./guessSession";
import { guessCardText } from "./messages";
import { reportIssueUrl } from "./reportIssue";
import { ResultStrip, ResultView } from "./ResultView";
import { UsedCounter } from "./UsedCounter";

type PlayScreenProps = {
  graph: GraphVersion;
  trip: Trip;
  storage: KeyValueStorage;
  sessionStorage: KeyValueStorage;
  now: Date;
};

export function PlayScreen({ graph, trip, storage, sessionStorage, now }: PlayScreenProps) {
  const [session, setSession] = useState<GuessSession>(() => ({
    game: loadSavedGame(storage, graph, trip),
    text: "",
  }));
  const { game, toast, announcement } = session;

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
  const [resultClosed, setResultClosed] = useState(
    () => readJson(sessionStorage, CLOSED_RESULT_KEY) === trip.number,
  );
  const closeResult = (closed: boolean) => {
    setResultToggled(true);
    setResultClosed(closed);
    if (closed) writeJson(sessionStorage, CLOSED_RESULT_KEY, trip.number);
    else sessionStorage.removeItem(CLOSED_RESULT_KEY);
  };
  const resultOpen = settled && !resultClosed;
  const reopenButton = useRef<HTMLButtonElement>(null);
  const guessInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (resultClosed && resultToggled) reopenButton.current?.focus();
  }, [resultClosed, resultToggled]);
  const nameOf = (code: string) => kommunName(graph, code);
  const history = useMemo(
    () => withFinishedGame(readHistory(storage), graph, game),
    [storage, graph, game],
  );
  const todayEntry = history[trip.number];
  const outcome = gameOutcome(review);
  const share =
    todayEntry !== undefined && outcome !== undefined
      ? shareText({ tripNumber: trip.number, outcome, emojiLine: todayEntry.emojiLine })
      : undefined;
  const showResult = resultOpen && share !== undefined;

  useEffect(() => {
    saveGame(storage, game);
    recordFinishedGame(storage, graph, game);
  }, [storage, graph, game]);

  return (
    <section className="play-screen" aria-labelledby="trip-heading">
      <p className="trip-number">Dagens resa #{trip.number}</p>
      <h2 id="trip-heading">
        Res från <strong className="sign sign--start">{nameOf(trip.start)}</strong> till{" "}
        <strong className="sign sign--destination">{nameOf(trip.destination)}</strong>
      </h2>

      {showResult && (
        <ResultView
          graph={graph}
          game={game}
          review={review}
          now={now}
          stats={deriveStats(history, trip.number)}
          shareText={share}
          sessionStorage={sessionStorage}
          onClose={() => closeResult(true)}
          focusOnOpen={resultToggled || announcement !== undefined}
        />
      )}

      {settled && !resultOpen && share !== undefined && (
        <ResultStrip
          review={review}
          shareText={share}
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
            text={session.text}
            exactMatch={resolveKommunName(graph, session.text) !== undefined}
            suggestions={suggestKommuner(graph, game, session.text)}
            highlighted={enterTarget(graph, session)}
            counter={<UsedCounter label="Gissa" used={review.cards.length} limit={review.limit} />}
            onEvent={(event) => setSession((current) => applyGuessInput(graph, current, event))}
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
              onTakeHint={() => setSession((current) => takeSessionHint(graph, current))}
              focusAfterLastHint={guessInput}
            />
          )}
        </>
      )}

      <footer className="credits">
        <a href={reportIssueUrl({ tripNumber: trip.number, graphVersion: graph.id })}>
          Rapportera fel
        </a>
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

/** The trip number whose result the player collapsed this session. */
const CLOSED_RESULT_KEY = "akle:result-closed";
