import { type ModeSetting, THINKING_TIME_RANGE } from "../freePlay/linkPayload";
import { PLAYABLE_MODES } from "../freePlay/modeRules";
import { MODE_NAMES } from "./messages";
import "./ModeCards.css";

type ModeKind = ModeSetting["kind"];

/** Every mode in the order the player is offered them, with its name and how it plays. */
export const MODES: { kind: ModeKind; name: string; description: string }[] = [
  {
    kind: "standard",
    name: MODE_NAMES.standard,
    description: "Som dagens resa: gissningarna räcker till avståndet och lite till.",
  },
  {
    kind: "unlimited",
    name: MODE_NAMES.unlimited,
    description: "Gissa hur många gånger du vill. Ge upp när du vill.",
  },
  {
    kind: "timed",
    name: MODE_NAMES.timed,
    description: "Varje gissning måste göras inom betänketiden.",
  },
  {
    kind: "tie-breaker",
    name: MODE_NAMES["tie-breaker"],
    description: "Tiden tas. Vid lika poäng vinner den snabbaste.",
  },
];

/**
 * The Läge choice: one card per mode, its name and a line on how it plays, as a radio group.
 * Tidspress, when chosen, shows its betänketid in its card. Modes whose tickets haven't landed
 * yet are shown but can't be chosen.
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
        // The card holds the radio's label and, beside it rather than inside, the betänketid.
        <div key={kind} className="free-play-mode">
          <label className="free-play-mode-choice">
            <input
              type="radio"
              name="free-play-mode"
              value={kind}
              checked={mode.kind === kind}
              disabled={!PLAYABLE_MODES.has(kind)}
              onChange={() => choose(kind)}
            />
            <span className="free-play-mode-name">{name}</span>
            <span className="free-play-mode-description">{description}</span>
          </label>
          {kind === "timed" && mode.kind === "timed" && (
            <ThinkingTimeField
              id="free-play-thinking-time"
              seconds={mode.thinkingTime}
              onChange={(seconds) => onChange({ kind: "timed", thinkingTime: seconds })}
            />
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
