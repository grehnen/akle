import { type FormEvent, useState } from "react";
import { type Game, newGame, type Puzzle, reviewGame, submitGuess } from "../engine/game";
import { type GraphVersion, kommunName } from "../graph/graphVersion";
import { outcomeMessage, rejectionMessage } from "./messages";

type PlayScreenProps = {
  graph: GraphVersion;
  puzzle: Puzzle;
};

export function PlayScreen({ graph, puzzle }: PlayScreenProps) {
  const [game, setGame] = useState<Game>(() => newGame(puzzle));
  const [input, setInput] = useState("");
  const [toast, setToast] = useState<string>();

  const review = reviewGame(graph, game);
  const nameOf = (code: string) => kommunName(graph, code);
  const outcome = outcomeMessage(review, review.missing.map(nameOf));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = submitGuess(graph, game, input);
    if (result.kind === "accepted") {
      setGame(result.game);
      setInput("");
      setToast(undefined);
      return;
    }
    setToast(rejectionMessage(result.reason, input.trim()));
    if (result.reason !== "unknown") setInput("");
  }

  return (
    <section aria-labelledby="puzzle-heading">
      <h2 id="puzzle-heading">
        Res från <strong>{nameOf(puzzle.start)}</strong> till{" "}
        <strong>{nameOf(puzzle.destination)}</strong>
      </h2>
      <p>Dagens pussel #{puzzle.number}</p>

      <form onSubmit={handleSubmit}>
        <label htmlFor="guess-input">Kommun</label>{" "}
        <input
          id="guess-input"
          type="text"
          autoComplete="off"
          value={input}
          disabled={review.status !== "playing"}
          onChange={(event) => setInput(event.target.value)}
        />{" "}
        <button type="submit" disabled={review.status !== "playing"}>
          Gissa ({review.cards.length}/{review.limit})
        </button>
      </form>

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
