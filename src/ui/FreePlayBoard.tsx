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
import { freePlayHeadline, scoreText, timeText } from "./messages";
import { ScoreLabel } from "./ScoreLabel";
import { ScoreTooltip } from "./ScoreTooltip";
import { ShareButton } from "./ShareButton";
import { ThinkingTimeBar } from "./ThinkingTimeBar";
import { TripBoard } from "./TripBoard";
import { TripClock } from "./TripClock";
import { useNow } from "./useNow";

export type FreePlayBoardProps = {
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
};

/**
 * A free-play trip on the board in its mode: its clock or thinking time while played, then in
 * the result its headline, its score (explained in a tooltip) over its outcome label as the share
 * text words it and a won tie-breaker's time, and a share button when it has a `link` to share.
 * `resultActions` come before that button in the result view, `stripActions` after it in the strip.
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
}: FreePlayBoardProps) {
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
  const scoreFinished = score !== undefined && outcome !== undefined;
  const points = scoreFinished && (
    <p className="result-points">
      <ScoreTooltip>{scoreText(score)}</ScoreTooltip>
    </p>
  );
  const pointsDetail = scoreFinished && (
    <p className="result-score-detail">
      <ScoreLabel outcome={outcome} />
      {game.rules.keepsTime && time !== undefined && (
        <>
          {" · "}
          <span className="result-time">Tid {timeText(time)}</span>
        </>
      )}
    </p>
  );
  const shareButton = share !== undefined && <ShareButton text={share} />;
  return (
    <TripBoard
      graph={graph}
      game={game}
      onGameChange={onGameChange}
      sessionStorage={sessionStorage}
      label={label}
      resultHeadline={outcome && freePlayHeadline(outcome)}
      clock={thinking && <ThinkingTimeBar game={game} now={now} />}
      mapCorner={game.rules.keepsTime && <TripClock game={game} clock={clock} />}
      timeouts={timed ? timeoutRuns(game, now) : undefined}
      openedByPlayer={openedByPlayer}
      concealed={concealed}
      onMapReady={onMapReady}
      resultScore={points}
      resultScoreDetail={pointsDetail}
      resultActions={
        <>
          {resultActions}
          {shareButton}
        </>
      }
      stripActions={
        <>
          {points}
          {pointsDetail}
          {shareButton}
          {stripActions}
        </>
      }
    />
  );
}
