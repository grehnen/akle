import { useMemo, useState } from "react";
import { type Game, newGame, reviewGame, STANDARD_RULES } from "../engine/game";
import { tripScore } from "../engine/score";
import { endpointSuggestions, pickedTrip, resolveEndpoint } from "../freePlay/endpoints";
import type { GraphVersion } from "../graph/graphVersion";
import type { KeyValueStorage } from "../progress/storage";
import { EndpointField } from "./EndpointField";
import { scoreText } from "./messages";
import { TripBoard } from "./TripBoard";
import "./FreePlayScreen.css";

type FreePlayScreenProps = {
  /** The current version, which every new free-play trip is played on. */
  graph: GraphVersion;
  /** For the board's view choices, such as the result tab; free play keeps no progress. */
  sessionStorage: KeyValueStorage;
};

/**
 * Free play: the Fri resa setup screen, then the picked trip on the board in standard mode,
 * with its score in the result. Nothing here reads or writes daily progress.
 */
export function FreePlayScreen({ graph, sessionStorage }: FreePlayScreenProps) {
  const [game, setGame] = useState<Game>();
  if (game === undefined) {
    return (
      <FreePlaySetup graph={graph} onStart={(trip) => setGame(newGame(trip, STANDARD_RULES))} />
    );
  }
  return (
    <FreePlayBoard
      graph={graph}
      game={game}
      onGameChange={setGame}
      sessionStorage={sessionStorage}
    />
  );
}

function FreePlayBoard({
  graph,
  game,
  onGameChange,
  sessionStorage,
}: {
  graph: GraphVersion;
  game: Game;
  onGameChange: (game: Game) => void;
  sessionStorage: KeyValueStorage;
}) {
  const score = useMemo(() => tripScore(reviewGame(graph, game)), [graph, game]);
  const scoreLine = score !== undefined && <p className="result-score">{scoreText(score)}</p>;
  return (
    <TripBoard
      graph={graph}
      game={game}
      onGameChange={onGameChange}
      sessionStorage={sessionStorage}
      label={<p className="trip-number">Fri resa · Standard</p>}
      resultActions={scoreLine}
      stripActions={scoreLine}
    />
  );
}

function FreePlaySetup({
  graph,
  onStart,
}: {
  graph: GraphVersion;
  onStart: (trip: { start: string; destination: string }) => void;
}) {
  const [startText, setStartText] = useState("");
  const [destinationText, setDestinationText] = useState("");
  const start = resolveEndpoint(graph, startText);
  const destination = resolveEndpoint(graph, destinationText);
  const picked = pickedTrip(graph, start, destination);
  const problem =
    start === undefined || destination === undefined
      ? undefined
      : start === destination
        ? "Start och mål är samma kommun."
        : graph.neighbors.get(start)?.has(destination)
          ? "Start och mål är grannar. Välj en kommun längre bort."
          : undefined;

  return (
    <section className="free-play-setup" aria-labelledby="free-play-heading">
      <h2 id="free-play-heading">Fri resa</h2>
      <div role="tablist" aria-label="Välj resa" className="free-play-tabs">
        <button
          type="button"
          role="tab"
          id="free-play-tab-pick"
          aria-selected="true"
          aria-controls="free-play-panel-pick"
        >
          Välj själv
        </button>
      </div>
      <form
        id="free-play-panel-pick"
        role="tabpanel"
        aria-labelledby="free-play-tab-pick"
        className="free-play-panel"
        onSubmit={(event) => {
          event.preventDefault();
          if (picked) onStart(picked.trip);
        }}
      >
        <EndpointField
          id="free-play-start"
          label="Start"
          end="start"
          text={startText}
          suggestions={endpointSuggestions(graph, startText, destination)}
          onTextChange={setStartText}
        />
        <EndpointField
          id="free-play-destination"
          label="Mål"
          end="destination"
          text={destinationText}
          suggestions={endpointSuggestions(graph, destinationText, start)}
          onTextChange={setDestinationText}
        />
        <p className="free-play-distance" aria-live="polite">
          {picked !== undefined ? `Avstånd ${picked.distance}` : problem}
        </p>
        <button type="submit" className="free-play-go" disabled={picked === undefined}>
          Res
        </button>
      </form>
    </section>
  );
}
