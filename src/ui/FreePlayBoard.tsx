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
import { scoreText, timeText } from "./messages";
import { ShareButton } from "./ShareButton";
import { ThinkingTimeBar } from "./ThinkingTimeBar";
import { TripBoard } from "./TripBoard";
import { TripClock } from "./TripClock";
import { useNow } from "./useNow";

/**
 * A free-play trip on the board in its mode: its clock or thinking time while played, then its
 * score (and a tie-breaker's time) in the result, with a share button when it has a `link` to
 * share. `resultActions` and `stripActions` follow those, in the result view and its strip.
 */
export function FreePlayBoard({
  graph,
  mode,
  game,
  link,
  label,
  clock,
  focusGuessOnOpen,
  onGameChange,
  sessionStorage,
  resultActions,
  stripActions,
}: {
  graph: GraphVersion;
  mode: ModeSetting;
  game: Game;
  /** The trip's own link, shared from its result; an itinerary's trips have none. */
  link?: string;
  label: ReactNode;
  clock: Clock;
  focusGuessOnOpen: boolean;
  onGameChange: (game: Game) => void;
  sessionStorage: KeyValueStorage;
  resultActions?: ReactNode;
  stripActions?: ReactNode;
}) {
  const review = useMemo(() => reviewGame(graph, game), [graph, game]);
  // A timed trip's thinking time runs on real time, read again on each tick while it's played.
  const timed = game.rules.thinkingTime !== undefined;
  const thinking = timed && review.status === "playing";
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
  const scoreAndShare = score !== undefined && (
    <>
      <p className="result-score">{scoreText(score)}</p>
      {game.rules.keepsTime && <ResultTime time={time} />}
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
      clock={
        game.rules.keepsTime ? (
          <TripClock game={game} clock={clock} />
        ) : (
          thinking && <ThinkingTimeBar game={game} now={now} />
        )
      }
      timeouts={timed ? timeoutRuns(game, now) : undefined}
      focusGuessOnOpen={focusGuessOnOpen}
      resultActions={
        <>
          {scoreAndShare}
          {resultActions}
        </>
      }
      stripActions={
        <>
          {scoreAndShare}
          {stripActions}
        </>
      }
    />
  );
}

/** A tie-breaker trip's time in the result: a win's to tenths, or `–` for a loss, which has none. */
function ResultTime({ time }: { time?: number }) {
  return (
    <p className="result-time">
      Tid{" "}
      {time === undefined ? (
        <>
          <span aria-hidden="true">–</span>
          <span className="visually-hidden">saknas, bara en vinst får tid</span>
        </>
      ) : (
        timeText(time)
      )}
    </p>
  );
}
