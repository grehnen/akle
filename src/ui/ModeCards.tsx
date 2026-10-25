import { type ModeSetting, THINKING_TIME_RANGE } from "../freePlay/linkPayload";
import { MODES } from "./messages";
import "./ModeCards.css";

type ModeKind = ModeSetting["kind"];

/**
 * The Läge choice: one card per mode, its name and a line on how it plays, as a radio group.
 * Tidspress, when chosen, shows its betänketid in its card.
 */
export function ModeCards({
  mode,
  thinkingTime,
  onChange,
}: {
  mode: ModeSetting;
  /** The betänketid Tidspress takes when chosen, kept while another mode is. */
  thinkingTime: number;
  onChange: (mode: ModeSetting) => void;
}) {
  const choose = (kind: ModeKind) => onChange(kind === "timed" ? { kind, thinkingTime } : { kind });
  return (
    <fieldset className="free-play-modes">
      <legend className="section-heading">Läge</legend>
      {MODES.map(({ kind, name, description }) => (
        // The card holds the radio's label and, beside it rather than inside, the betänketid. A
        // click anywhere on it picks its mode; the label's own clicks go through the radio, and
        // the keyboard keeps to the radio group.
        <div
          key={kind}
          className="free-play-mode"
          onClick={(event) => {
            const onLabel = (event.target as Element).closest(".free-play-mode-choice") !== null;
            if (!onLabel && mode.kind !== kind) choose(kind);
          }}
        >
          <label className="free-play-mode-choice">
            <input
              type="radio"
              name="free-play-mode"
              value={kind}
              checked={mode.kind === kind}
              onChange={() => choose(kind)}
            />
            <span className="free-play-mode-name">{name}</span>
            <span className="free-play-mode-description">{description}</span>
          </label>
          {/* Kept in place, hidden and inert, until Tidspress is chosen, so the cards don't grow. */}
          {kind === "timed" && (
            <div className="free-play-mode-setting" inert={mode.kind !== "timed"}>
              <ThinkingTimeField
                id="free-play-thinking-time"
                seconds={mode.kind === "timed" ? mode.thinkingTime : thinkingTime}
                onChange={(seconds) => onChange({ kind: "timed", thinkingTime: seconds })}
              />
            </div>
          )}
        </div>
      ))}
    </fieldset>
  );
}

/** The betänketid: whole seconds within the range a trip link can carry. */
export function ThinkingTimeField({
  id,
  labelHidden = false,
  seconds,
  onChange,
}: {
  /** Unique on the page. */
  id: string;
  labelHidden?: boolean;
  seconds: number;
  onChange: (seconds: number) => void;
}) {
  return (
    <div className="free-play-thinking-time">
      <label htmlFor={id} className={labelHidden ? "visually-hidden" : undefined}>
        Betänketid
      </label>
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
