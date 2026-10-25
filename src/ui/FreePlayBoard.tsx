import { type ReactNode, useMemo } from "react";
import type { Clock } from "../engine/clock";
import { type Game, reviewGame } from "../engine/game";
import { tripScore } from "../engine/score";
import { timeoutRuns } from "../engine/thinkingTime";
import { tripTime } from "../engine/tripTime";
import type { ModeSetting } from "../freePlay/linkPayload";
import { freePlayShareText } from "../freePlay/shareText";
import type { GraphVersion } from "../graph/graphVersion";
import { emojiLine } from "../progress/history";
import { gameOutcome } from "../progress/outcome";
import type { KeyValueStorage } from "../progress/storage";
import { freePlayHeadline, LOWER_IS_BETTER, scoreText, timeText } from "./messages";
import { ScoreLabel } from "./ScoreLabel";
import { ShareButton } from "./ShareButton";
import { ThinkingTimeBar } from "./ThinkingTimeBar";
import { TripBoard } from "./TripBoard";
import { TripClock } from "./TripClock";
import { useNow } from "./useNow";

/**
 * A free-play trip on the board in its mode: its clock or thinking time while played, then in
 * the result its headline, its outcome label and score as the share text words them (saying lower
 * is better), a won tie-breaker's time, and a share button when it has a `link` to share.
 * `resultActions` and `stripActions` follow those, in the result view and its strip.
 */
export function FreePlayBoard({
  graph,
  mode,
  game,
  link,
  label,
  clock,
  openedByPlayer,
  onGameChange,
  sessionStorage,
  resultActions,
  stripActions,
  concealed = false,
  onMapReady,
}: {
  graph: GraphVersion;
  mode: ModeSetting;
  game: Game;
  /** The trip's own link, shared from its result; an itinerary's trips have none. */
  link?: string;
  label: ReactNode;
  clock: Clock;
  /** The board opens by the player's own action, as `TripBoard` takes it. */
  openedByPlayer: boolean;
  onGameChange: (game: Game) => void;
  sessionStorage: KeyValueStorage;
  resultActions?: ReactNode;
  stripActions?: ReactNode;
  /** Loads the board unseen behind `Starta`, as `TripBoard` does. */
  concealed?: boolean;
  onMapReady?: () => void;
}) {
  const review = useMemo(() => reviewGame(graph, game), [graph, game]);
  // A timed trip's thinking time runs on real time, read again on each tick while it's played.
  const timed = game.rules.thinkingTime !== undefined;
  const thinking = timed && review.status === "playing" && !concealed;
  const now = useNow(clock, thinking);
  const score = tripScore(review);
  const outcome = gameOutcome(review);
  const time = tripTime(game);
  const share =
    link !== undefined && score !== undefined && outcome !== undefined
      ? freePlayShareText({
          mode,
          outcome,
          score,
          time,
          emojiLine: emojiLine(review.cards),
          link,
        })
      : undefined;
  const scoreLine = score !== undefined && outcome !== undefined && (
    <p className="result-score">
      <ScoreLabel outcome={outcome} /> · {scoreText(score)}
    </p>
  );
  const timeAndShare = score !== undefined && (
    <>
      {game.rules.keepsTime && time !== undefined && (
        <p className="result-time">Tid {timeText(time)}</p>
      )}
      {share !== undefined && <ShareButton text={share} />}
    </>
  );
  return (
    <TripBoard
      graph={graph}
      game={game}
      onGameChange={onGameChange}
      sessionStorage={sessionStorage}
      label={label}
      resultHeadline={outcome && freePlayHeadline(outcome)}
      clock={
        game.rules.keepsTime ? (
          <TripClock game={game} clock={clock} />
        ) : (
          thinking && <ThinkingTimeBar game={game} now={now} />
        )
      }
      timeouts={timed ? timeoutRuns(game, now) : undefined}
      openedByPlayer={openedByPlayer}
      concealed={concealed}
      onMapReady={onMapReady}
      resultActions={
        <>
          {scoreLine && (
            <div className="result-score-block">
              {scoreLine}
              <p className="result-score-note">{LOWER_IS_BETTER}</p>
            </div>
          )}
          {timeAndShare}
          {resultActions}
        </>
      }
      stripActions={
        <>
          {scoreLine}
          {timeAndShare}
          {stripActions}
        </>
      }
    />
  );
}
