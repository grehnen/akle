import { type KeyboardEvent, useState } from "react";
import type { KommunCode } from "../graph/graphVersion";
import "./GuessInput.css";
import { matchedSegments, type Suggestion } from "./guessSession";

type EndpointFieldProps = {
  /** Unique on the page; the input, its list and its options are named after it. */
  id: string;
  label: string;
  /** `start` or `destination`, for the road-sign colour of the field. */
  end: "start" | "destination";
  text: string;
  suggestions: readonly Suggestion[];
  onTextChange: (text: string) => void;
};

/**
 * A Start or Mål field: a combobox whose suggestions fill the field when picked, by click, by
 * Enter, or by the arrow keys and Enter. Disabled suggestions show their tag and can't be picked.
 */
export function EndpointField({
  id,
  label,
  end,
  text,
  suggestions,
  onTextChange,
}: EndpointFieldProps) {
  const [dismissed, setDismissed] = useState(false);
  const [highlighted, setHighlighted] = useState<KommunCode>();
  const pickable = suggestions.filter((suggestion) => !suggestion.disabled);
  const filled = pickable.length === 1 && pickable[0]?.name === text;
  const expanded = !dismissed && suggestions.length > 0 && !filled;
  const active = pickable.find((s) => s.code === highlighted) ?? pickable[0];
  const listId = `${id}-suggestions`;
  const optionId = (code: KommunCode) => `${id}-option-${code}`;

  const pick = (suggestion: Suggestion) => {
    setHighlighted(undefined);
    setDismissed(true);
    onTextChange(suggestion.name);
  };

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setDismissed(false);
      if (pickable.length === 0) return;
      const current = active === undefined ? -1 : pickable.indexOf(active);
      const step = event.key === "ArrowDown" ? 1 : -1;
      const next = (current + step + pickable.length) % pickable.length;
      setHighlighted(pickable[next]?.code);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (expanded && active) pick(active);
    } else if (event.key === "Escape" && expanded) {
      event.preventDefault();
      setDismissed(true);
    }
  }

  return (
    <div className={`endpoint-field endpoint-field--${end}`}>
      <label htmlFor={id}>{label}</label>
      <div className="guess-input__field">
        <input
          id={id}
          type="text"
          role="combobox"
          placeholder="Namn eller kommunkod"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={expanded}
          aria-activedescendant={expanded && active ? optionId(active.code) : undefined}
          value={text}
          onChange={(event) => {
            setDismissed(false);
            setHighlighted(undefined);
            onTextChange(event.target.value);
          }}
          onFocus={() => setDismissed(false)}
          onBlur={() => setDismissed(true)}
          onKeyDown={handleKeyDown}
        />
        {expanded && (
          <ul id={listId} role="listbox" aria-label={label} className="guess-input__list">
            {suggestions.map((suggestion) => (
              <li
                key={suggestion.code}
                id={optionId(suggestion.code)}
                role="option"
                aria-selected={suggestion.code === active?.code}
                aria-disabled={suggestion.disabled ? true : undefined}
                className="guess-input__option"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => !suggestion.disabled && pick(suggestion)}
              >
                <span>
                  {matchedSegments(suggestion.name, text).map((segment, index) =>
                    segment.matched ? (
                      <mark key={index} className="guess-input__match">
                        {segment.text}
                      </mark>
                    ) : (
                      segment.text
                    ),
                  )}
                </span>
                {suggestion.disabled && (
                  <span className="guess-input__tag">{suggestion.disabled}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
