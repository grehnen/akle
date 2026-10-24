import type { ModeSetting } from "../freePlay/linkPayload";
import { PLAYABLE_MODES } from "../freePlay/modeRules";
import "./ModeCards.css";

type ModeKind = ModeSetting["kind"];

const MODES: { kind: ModeKind; name: string; description: string }[] = [
  {
    kind: "standard",
    name: "Standard",
    description: "Som dagens resa: gissningarna räcker till avståndet och lite till.",
  },
  {
    kind: "unlimited",
    name: "Obegränsad",
    description: "Gissa hur många gånger du vill. Ge upp när du vill.",
  },
  {
    kind: "timed",
    name: "Tidspress",
    description: "Varje gissning måste göras inom betänketiden.",
  },
  {
    kind: "tie-breaker",
    name: "Tidtagning",
    description: "Tiden tas. Vid lika poäng vinner den snabbaste.",
  },
];

/**
 * The Läge choice: one card per mode, its name and a line on how it plays, as a radio group.
 * Modes whose tickets haven't landed yet are shown but can't be chosen.
 */
export function ModeCards({
  mode,
  onChange,
}: {
  mode: ModeSetting;
  onChange: (mode: ModeSetting) => void;
}) {
  return (
    <fieldset className="free-play-modes">
      <legend className="section-heading">Läge</legend>
      {MODES.map(({ kind, name, description }) => (
        <label key={kind} className="free-play-mode">
          <input
            type="radio"
            name="free-play-mode"
            value={kind}
            checked={mode.kind === kind}
            disabled={!PLAYABLE_MODES.has(kind)}
            onChange={() => {
              if (kind !== "timed") onChange({ kind });
            }}
          />
          <span className="free-play-mode-name">{name}</span>
          <span className="free-play-mode-description">{description}</span>
        </label>
      ))}
    </fieldset>
  );
}
