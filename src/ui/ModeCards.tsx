import { type ModeKind, type ModeSetting, THINKING_TIME_RANGE } from "../freePlay/linkPayload";
import { MODES } from "./messages";
import "./ModeCards.css";

/**
 * The Läge choice: one card per mode, its name and a line on how it plays (or, given
 * `shortDescriptions`, a short one), as a radio group named `name`, unique on the page.
 */
export function ModeCards({
  name: groupName,
  mode,
  thinkingTime,
  shortDescriptions = false,
  onChange,
}: {
  name: string;
  mode: ModeSetting;
  /** The betänketid Tidspress takes when chosen, kept while another mode is. */
  thinkingTime: number;
  shortDescriptions?: boolean;
  onChange: (mode: ModeSetting) => void;
}) {
  const choose = (kind: ModeKind) => onChange(kind === "timed" ? { kind, thinkingTime } : { kind });
  return (
    <fieldset className="free-play-modes">
      <legend className="section-heading">Läge</legend>
      {MODES.map(({ kind, name, description, shortDescription }) => (
        <label key={kind} className="free-play-mode">
          <input
            type="radio"
            name={groupName}
            value={kind}
            checked={mode.kind === kind}
            onChange={() => choose(kind)}
          />
          <span className="free-play-mode-name">{name}</span>
          <span className="free-play-mode-description">
            {shortDescriptions ? shortDescription : description}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

/** The betänketid: whole seconds within the range a trip link can carry. */
export function ThinkingTimeField({
  id,
  seconds,
  onChange,
}: {
  /** Unique on the page. */
  id: string;
  seconds: number;
  onChange: (seconds: number) => void;
}) {
  return (
    <div className="free-play-thinking-time">
      <label htmlFor={id}>Betänketid</label>
      <input
        id={id}
        type="range"
        min={THINKING_TIME_RANGE.min}
        max={THINKING_TIME_RANGE.max}
        step={1}
        value={seconds}
        aria-valuetext={`${seconds} sekunder`}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <output htmlFor={id}>{seconds} s</output>
    </div>
  );
}
