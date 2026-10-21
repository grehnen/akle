import { useEffect, useMemo, useRef, useState } from "react";
import { resolveKommunName } from "../engine/kommunNames";
import { type Puzzle, reviewGame } from "../engine/game";
import { HINT_COUNT, hintReveals } from "../engine/hints";
import { type GraphVersion, kommunName } from "../graph/graphVersion";
import { SatelliteMap } from "../map/SatelliteMap";
import { readHistory, recordFinishedGame, withFinishedGame } from "../progress/history";
import { loadSavedGame, saveGame } from "../progress/savedGame";
import { shareText } from "../progress/shareText";
import { deriveStats } from "../progress/stats";
import type { KeyValueStorage } from "../progress/storage";
import { GuessInput } from "./GuessInput";
import {
  applyGuessInput,
  type GuessSession,
  suggestKommuner,
  takeSessionHint,
} from "./guessSession";
import { guessCardText, hintRevealed } from "./messages";
import { reportIssueUrl } from "./reportIssue";
import { ResultView } from "./ResultView";
import { UsedCounter } from "./UsedCounter";

type PlayScreenProps = {
  graph: GraphVersion;
  puzzle: Puzzle;
  storage: KeyValueStorage;
  now: Date;
};

export function PlayScreen({ graph, puzzle, storage, now }: PlayScreenProps) {
  const [session, setSession] = useState<GuessSession>(() => ({
    game: loadSavedGame(storage, graph, puzzle),
    text: "",
  }));
  const { game, toast, announcement } = session;

  const review = useMemo(() => reviewGame(graph, game), [graph, game]);
  const reveals = useMemo(() => hintReveals(graph, game), [graph, game]);
  const finished = review.status !== "playing";
  const [resultClosed, setResultClosed] = useState(false);
  const resultOpen = finished && !resultClosed;
  // Focus follows the result view when it opens or closes by the player's hand, not on reload.
  const [resultToggled, setResultToggled] = useState(false);
  const reopenButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (resultClosed) reopenButton.current?.focus();
  }, [resultClosed]);
  const nameOf = (code: string) => kommunName(graph, code);
  const history = useMemo(
    () => withFinishedGame(readHistory(storage), graph, game),
    [storage, graph, game],
  );
  const todayEntry = history[puzzle.number];

  useEffect(() => {
    saveGame(storage, game);
    recordFinishedGame(storage, graph, game);
  }, [storage, graph, game]);

  return (
    <section className="play-screen" aria-labelledby="puzzle-heading">
      <p className="puzzle-number">Dagens pussel #{puzzle.number}</p>
      <h2 id="puzzle-heading">
        Res från <strong>{nameOf(puzzle.start)}</strong> till{" "}
        <strong>{nameOf(puzzle.destination)}</strong>
      </h2>

      {resultOpen && todayEntry && (
        <ResultView
          graph={graph}
          game={game}
          review={review}
          now={now}
          stats={deriveStats(history, puzzle.number)}
          shareText={shareText({ ...todayEntry, puzzleNumber: puzzle.number, away: review.away })}
          onClose={() => setResultClosed(true)}
          focusOnOpen={resultToggled || announcement !== undefined}
        />
      )}

      <SatelliteMap
        graph={graph}
        puzzle={puzzle}
        cards={review.cards}
        hintOutlines={reveals.outlines}
        initials={reveals.initials}
      />

      <GuessInput
        text={session.text}
        exactMatch={resolveKommunName(graph, session.text) !== undefined}
        suggestions={suggestKommuner(graph, game, session.text)}
        highlighted={session.highlighted}
        counter={<UsedCounter label="Gissa" used={review.cards.length} limit={review.limit} />}
        onEvent={(event) => setSession((current) => applyGuessInput(graph, current, event))}
      />

      <div className="hint-row">
        <p role="alert" className="toast">
          {toast}
        </p>
        {!finished && (
          <>
            <button
              type="button"
              className="hint-button"
              disabled={review.hintsUsed >= HINT_COUNT}
              onClick={() => setSession((current) => takeSessionHint(graph, current))}
            >
              <UsedCounter label="Ledtråd" used={review.hintsUsed} limit={HINT_COUNT} />
            </button>
            <p className="hint-note">{hintRevealed(review.hintsUsed)}</p>
          </>
        )}
      </div>
      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>

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

      {finished && !resultOpen && (
        <button
          ref={reopenButton}
          type="button"
          className="result-reopen"
          onClick={() => {
            setResultToggled(true);
            setResultClosed(false);
          }}
        >
          Visa resultat
        </button>
      )}

      <footer className="credits">
        <a href={reportIssueUrl({ puzzleNumber: puzzle.number, graphVersion: graph.id })}>
          Rapportera fel
        </a>
        <p>
          Satellitbild: EOxCloudless 2016 av EOX IT Services GmbH (CC BY 4.0). Kommungränser och
          grannar bygger på data från © OpenStreetMap-bidragsgivare och är licensierade under ODbL.
        </p>
      </footer>
    </section>
  );
}
