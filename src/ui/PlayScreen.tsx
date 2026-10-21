import { useMemo, useState } from "react";
import { newGame, type Puzzle, reviewGame } from "../engine/game";
import { type GraphVersion, kommunName } from "../graph/graphVersion";
import { SatelliteMap } from "../map/SatelliteMap";
import { GuessInput } from "./GuessInput";
import { applyGuessInput, type GuessSession, suggestKommuner } from "./guessSession";
import { outcomeMessage } from "./messages";
import { reportIssueUrl } from "./reportIssue";

type PlayScreenProps = {
  graph: GraphVersion;
  puzzle: Puzzle;
};

export function PlayScreen({ graph, puzzle }: PlayScreenProps) {
  const [session, setSession] = useState<GuessSession>(() => ({
    game: newGame(puzzle),
    text: "",
  }));
  const { game, toast } = session;

  const review = useMemo(() => reviewGame(graph, game), [graph, game]);
  const nameOf = (code: string) => kommunName(graph, code);
  const outcome = outcomeMessage(review, review.missing.map(nameOf));

  return (
    <section className="play-screen" aria-labelledby="puzzle-heading">
      <p className="puzzle-number">Dagens pussel #{puzzle.number}</p>
      <h2 id="puzzle-heading">
        Res från <strong>{nameOf(puzzle.start)}</strong> till{" "}
        <strong>{nameOf(puzzle.destination)}</strong>
      </h2>

      <SatelliteMap graph={graph} puzzle={puzzle} cards={review.cards} />

      <GuessInput
        text={session.text}
        suggestions={suggestKommuner(graph, game, session.text)}
        highlighted={session.highlighted}
        counter={`Gissa (${review.cards.length}/${review.limit})`}
        disabled={review.status !== "playing"}
        onEvent={(event) => setSession((current) => applyGuessInput(graph, current, event))}
      />

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

      {outcome && <p role="alert">{outcome}</p>}

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
