import type { KeyboardEvent } from "react";
import type { KommunCode } from "../graph/graphVersion";
import "./GuessInput.css";
import type { GuessInputEvent, Suggestion } from "./guessSession";

type GuessInputProps = {
  text: string;
  suggestions: readonly Suggestion[];
  highlighted?: KommunCode;
  /** The Gissa button's label, with the guess counter. */
  counter: string;
  disabled: boolean;
  onEvent: (event: GuessInputEvent) => void;
};

const LISTBOX_ID = "guess-suggestions";
const optionId = (code: KommunCode) => `suggestion-${code}`;

export function GuessInput({
  text,
  suggestions,
  highlighted,
  counter,
  disabled,
  onEvent,
}: GuessInputProps) {
  const expanded = !disabled && suggestions.length > 0;

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      onEvent({ type: "arrow", direction: event.key === "ArrowDown" ? "down" : "up" });
    } else if (event.key === "Enter") {
      event.preventDefault();
      onEvent({ type: "enter" });
    }
  }

  return (
    <form
      className="guess-input"
      onSubmit={(event) => {
        event.preventDefault();
        onEvent({ type: "gissa" });
      }}
    >
      <label htmlFor="guess-input">Kommun</label>
      <div className="guess-input__field">
        <input
          id="guess-input"
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          aria-autocomplete="list"
          aria-controls={LISTBOX_ID}
          aria-expanded={expanded}
          aria-activedescendant={expanded && highlighted ? optionId(highlighted) : undefined}
          value={text}
          disabled={disabled}
          onChange={(event) => onEvent({ type: "type", text: event.target.value })}
          onKeyDown={handleKeyDown}
        />
        {expanded && (
          <ul id={LISTBOX_ID} role="listbox" aria-label="Förslag" className="guess-input__list">
            {suggestions.map((suggestion) => (
              <li
                key={suggestion.code}
                id={optionId(suggestion.code)}
                role="option"
                aria-selected={suggestion.code === highlighted}
                aria-disabled={suggestion.disabled ? true : undefined}
                className="guess-input__option"
                // Keeps focus in the input so the arrow keys and Enter keep working after a click.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onEvent({ type: "pick", code: suggestion.code })}
              >
                <span>{suggestion.name}</span>
                {suggestion.disabled && (
                  <span className="guess-input__tag">{suggestion.disabled}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <button type="submit" disabled={disabled}>
        {counter}
      </button>
    </form>
  );
}
