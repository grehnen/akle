import { useEffect, useMemo, useState } from "react";
import { resolveKommunName } from "../engine/kommunNames";
import { type Puzzle, reviewGame } from "../engine/game";
import { HINT_COUNT, hintReveals, takeHint } from "../engine/hints";
import { type GraphVersion, kommunName } from "../graph/graphVersion";
import { SatelliteMap } from "../map/SatelliteMap";
import { readHistory, recordFinishedGame, withFinishedGame } from "../progress/history";
import { loadSavedGame, saveGame } from "../progress/savedGame";
import { shareText } from "../progress/shareText";
import { deriveStats } from "../progress/stats";
import type { KeyValueStorage } from "../progress/storage";
import { GuessInput } from "./GuessInput";
import { applyGuessInput, type GuessSession, suggestKommuner } from "./guessSession";
import { hintRevealed } from "./messages";
import { reportIssueUrl } from "./reportIssue";
import { ResultView } from "./ResultView";

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
  const { game, toast } = session;

  const review = useMemo(() => reviewGame(graph, game), [graph, game]);
  const reveals = useMemo(() => hintReveals(graph, game), [graph, game]);
  const finished = review.status !== "playing";
  const [resultClosed, setResultClosed] = useState(false);
  const resultOpen = finished && !resultClosed;
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
        counter={`Gissa (${review.cards.length}/${review.limit})`}
        disabled={review.status !== "playing"}
        onEvent={(event) => setSession((current) => applyGuessInput(graph, current, event))}
      />

      {!finished && (
        <div className="hint-row">
          <button
            type="button"
            className="hint-button"
            disabled={review.hintsUsed >= HINT_COUNT}
            onClick={() =>
              setSession((current) => ({ ...current, game: takeHint(graph, current.game) }))
            }
          >
            Ledtråd ({review.hintsUsed}/{HINT_COUNT})
          </button>
          <p className="hint-note" aria-live="polite">
            {hintRevealed(review.hintsUsed)}
          </p>
        </div>
      )}

      <p role="status" aria-live="polite">
        {toast}
      </p>

      <ol aria-label="Gissningar">
        {review.cards.map((card) => (
          <li key={card.code}>
            <span aria-hidden="true">{card.feedback}</span> {nameOf(card.code)}
          </li>
        ))}
      </ol>

      {finished && !resultOpen && (
        <button type="button" className="result-reopen" onClick={() => setResultClosed(false)}>
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
