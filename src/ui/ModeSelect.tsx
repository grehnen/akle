import { type ModeKind, type ModeSetting, THINKING_TIME_RANGE } from "../freePlay/linkPayload";
import { DEFAULT_THINKING_TIME } from "../freePlay/modeRules";
import { MODES } from "./messages";
import { ThinkingTimeField } from "./ModeCards";

/**
 * A trip's mode as a dropdown, and for Tidspress its betänketid beside it: the setup's slider, or
 * given `compactThinkingTime`'s label, a dropdown of seconds that keeps a trip row on one line.
 * `describedBy` names what says how the chosen mode plays.
 */
export function ModeSelect({
  id,
  label,
  labelHidden = false,
  describedBy,
  compactThinkingTime,
  mode,
  onChange,
}: {
  /** Unique on the page; the dropdowns are named after it. */
  id: string;
  label: string;
  labelHidden?: boolean;
  describedBy?: string;
  compactThinkingTime?: string;
  mode: ModeSetting;
  onChange: (mode: ModeSetting) => void;
}) {
  const choose = (kind: ModeKind) =>
    onChange(
      kind === "timed"
        ? {
            kind,
            thinkingTime: mode.kind === "timed" ? mode.thinkingTime : DEFAULT_THINKING_TIME,
          }
        : { kind },
    );
  const chooseSeconds = (seconds: number) => onChange({ kind: "timed", thinkingTime: seconds });
  return (
    <span className="itinerary-mode">
      <label htmlFor={`${id}-mode`} className={labelHidden ? "visually-hidden" : undefined}>
        {label}
      </label>
      <select
        id={`${id}-mode`}
        aria-describedby={describedBy}
        value={mode.kind}
        onChange={(event) => choose(event.target.value as ModeKind)}
      >
        {MODES.map(({ kind, name }) => (
          <option key={kind} value={kind}>
            {name}
          </option>
        ))}
      </select>
      {mode.kind === "timed" &&
        (compactThinkingTime === undefined ? (
          <ThinkingTimeField
            id={`${id}-thinking-time`}
            seconds={mode.thinkingTime}
            onChange={chooseSeconds}
          />
        ) : (
          <>
            <label htmlFor={`${id}-thinking-time`} className="visually-hidden">
              {compactThinkingTime}
            </label>
            <select
              id={`${id}-thinking-time`}
              className="itinerary-thinking-time"
              value={mode.thinkingTime}
              onChange={(event) => chooseSeconds(Number(event.target.value))}
            >
              {THINKING_TIMES.map((seconds) => (
                <option key={seconds} value={seconds}>
                  {seconds} s
                </option>
              ))}
            </select>
          </>
        ))}
    </span>
  );
}

/** Every whole second a betänketid can be. */
const THINKING_TIMES = Array.from(
  { length: THINKING_TIME_RANGE.max - THINKING_TIME_RANGE.min + 1 },
  (_, index) => THINKING_TIME_RANGE.min + index,
);
