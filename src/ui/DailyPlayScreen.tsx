import { useEffect, useMemo, useState } from "react";
import type { DailyTrip } from "../daily/dailyTrip";
import { type Game, reviewGame } from "../engine/game";
import type { GraphVersion } from "../graph/graphVersion";
import { readHistory, recordFinishedGame, withFinishedGame } from "../progress/history";
import { gameOutcome } from "../progress/outcome";
import { loadSavedGame, saveGame } from "../progress/savedGame";
import { shareText } from "../progress/shareText";
import { deriveStats } from "../progress/stats";
import { type KeyValueStorage, readJson, writeJson } from "../progress/storage";
import { reportIssueUrl } from "./reportIssue";
import { Countdown } from "./ResultView";
import { ShareButton } from "./ShareButton";
import { TripBoard } from "./TripBoard";

type DailyPlayScreenProps = {
  graph: GraphVersion;
  trip: DailyTrip;
  storage: KeyValueStorage;
  sessionStorage: KeyValueStorage;
  now: Date;
};

/**
 * Today's trip on the board, with what only a daily trip has: the saved game, the history and
 * stats, the `Dagens resa #n` label, the daily share text and Rapportera fel.
 */
export function DailyPlayScreen({
  graph,
  trip,
  storage,
  sessionStorage,
  now,
}: DailyPlayScreenProps) {
  const [game, setGame] = useState<Game<DailyTrip>>(() => loadSavedGame(storage, graph, trip));
  const [resultClosed] = useState(
    () => readJson(sessionStorage, CLOSED_RESULT_KEY) === trip.number,
  );
  const review = useMemo(() => reviewGame(graph, game), [graph, game]);
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

  useEffect(() => {
    saveGame(storage, game);
    recordFinishedGame(storage, graph, game);
  }, [storage, graph, game]);

  return (
    <TripBoard
      graph={graph}
      game={game}
      onGameChange={setGame}
      sessionStorage={sessionStorage}
      label={<p className="trip-number">Dagens resa #{trip.number}</p>}
      resultActions={
        share !== undefined && (
          <>
            <p className="result-countdown">
              Nästa resa om <Countdown from={now} />
            </p>
            <ShareButton text={share} />
          </>
        )
      }
      stripActions={share !== undefined && <ShareButton text={share} />}
      stats={deriveStats(history, trip.number)}
      resultClosed={resultClosed}
      onResultClosedChange={(closed) => {
        if (closed) writeJson(sessionStorage, CLOSED_RESULT_KEY, trip.number);
        else sessionStorage.removeItem(CLOSED_RESULT_KEY);
      }}
      footerLinks={
        <a href={reportIssueUrl({ tripNumber: trip.number, graphVersion: graph.id })}>
          Rapportera fel
        </a>
      }
    />
  );
}

/** The trip number whose result the player collapsed this session. */
const CLOSED_RESULT_KEY = "akle:result-closed";
