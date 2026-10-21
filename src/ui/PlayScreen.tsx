import { useState } from "react";
import { newGame, type Puzzle, reviewGame } from "../engine/game";
import { type GraphVersion, kommunName } from "../graph/graphVersion";
import { GuessInput } from "./GuessInput";
import { applyGuessInput, type GuessSession, suggestKommuner } from "./guessSession";
import { outcomeMessage } from "./messages";

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

  const review = reviewGame(graph, game);
  const nameOf = (code: string) => kommunName(graph, code);
  const outcome = outcomeMessage(review, review.missing.map(nameOf));

  return (
    <section aria-labelledby="puzzle-heading">
      <h2 id="puzzle-heading">
        Res från <strong>{nameOf(puzzle.start)}</strong> till{" "}
        <strong>{nameOf(puzzle.destination)}</strong>
      </h2>
      <p>Dagens pussel #{puzzle.number}</p>

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
    </section>
  );
}
