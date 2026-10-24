import { type CSSProperties, useState } from "react";
import type { Game } from "../engine/game";
import { thinkingTimeLeft, timeoutRuns } from "../engine/thinkingTime";
import { timeoutsText, warningAnnouncement } from "./messages";
import "./ThinkingTimeBar.css";

/**
 * A timed trip's thinking time as it runs down: a bar and the seconds left of it at `now`.
 * In its last third it turns a warning colour and bolds the seconds. Screen readers hear one
 * polite announcement as that third begins and one for each timeout, never every second.
 */
export function ThinkingTimeBar({ game, now }: { game: Game; now: number }) {
  const thinkingSeconds = game.rules.thinkingTime ?? 0;
  const left = thinkingTimeLeft(game, now) ?? 0;
  const secondsLeft = Math.ceil(left / 1000);
  const warningSeconds = Math.max(1, Math.floor(thinkingSeconds / 3));
  const warning = secondsLeft <= warningSeconds;
  const timeouts = timeoutRuns(game, now).reduce((sum, run) => sum + run, 0);
  // Each counted guess and each timeout starts a new thinking time, with its own warning.
  const thinkingTimeNumber = (game.guessedAt?.length ?? 0) + timeouts;

  // What was last announced, adjusted while rendering as the time moves on.
  const [heard, setHeard] = useState({
    timeouts,
    warned: warning ? thinkingTimeNumber : -1,
    text: "",
    count: 0,
  });
  const announce = (text: string, warned: number) =>
    setHeard({ timeouts, warned, text, count: heard.count + 1 });
  if (timeouts > heard.timeouts) {
    announce(timeoutsText(timeouts - heard.timeouts), warning ? thinkingTimeNumber : heard.warned);
  } else if (warning && heard.warned !== thinkingTimeNumber) {
    announce(warningAnnouncement(warningSeconds), thinkingTimeNumber);
  }

  const fill = {
    "--thinking-time-left": left / (thinkingSeconds * 1000),
    "--thinking-time-left-step": secondsLeft / thinkingSeconds,
  } as CSSProperties;
  return (
    <div className={warning ? "thinking-time thinking-time--warning" : "thinking-time"}>
      <div className="thinking-time-bar" aria-hidden="true">
        <div className="thinking-time-fill" style={fill} />
      </div>
      <p className="thinking-time-seconds">
        <span className="visually-hidden">Betänketid kvar: </span>
        <span role="timer">{secondsLeft}</span>
        <span aria-hidden="true"> s</span>
        <span className="visually-hidden"> sekunder</span>
      </p>
      {/* The same words twice in a row differ by a trailing space, so they're read again. */}
      <p className="visually-hidden" aria-live="polite">
        {heard.text}
        {heard.count % 2 === 1 ? " " : ""}
      </p>
    </div>
  );
}
