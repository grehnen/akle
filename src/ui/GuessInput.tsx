import { type KeyboardEvent, type ReactNode, type Ref, useState } from "react";
import type { KommunCode } from "../graph/graphVersion";
import "./GuessInput.css";
import { arrowDirection, type GuessInputEvent, type Suggestion } from "./guessSession";
import { useOnScreenKeyboard } from "./onScreenKeyboard";

type GuessInputProps = {
  text: string;
  /** Whether the text names a kommun exactly, so Enter submits it. */
  exactMatch?: boolean;
  suggestions: readonly Suggestion[];
  highlighted?: KommunCode;
  /** The Gissa button's label, with the guess counter. */
  counter: ReactNode;
  onEvent: (event: GuessInputEvent) => void;
  inputRef?: Ref<HTMLInputElement>;
};

const LISTBOX_ID = "guess-suggestions";
const optionId = (code: KommunCode) => `suggestion-${code}`;

export function GuessInput({
  text,
  exactMatch = false,
  suggestions,
  highlighted,
  counter,
  onEvent,
  inputRef,
}: GuessInputProps) {
  // Leaving the input closes the list; coming back or typing opens it again.
  const [dismissed, setDismissed] = useState(false);
  const expanded = !dismissed && suggestions.length > 0;
  // While the on-screen keyboard is open, the suggestions open upward (see GuessInput.css).
  const listOpensUpward = useOnScreenKeyboard();

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      onEvent({ type: "arrow", direction: arrowDirection(event.key, { listOpensUpward }) });
    } else if (event.key === "Enter") {
      event.preventDefault();
      onEvent({ type: "enter" });
    } else if (event.key === "Escape" && expanded) {
      event.preventDefault();
      setDismissed(true);
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
      <label htmlFor="guess-input" className="visually-hidden">
        Kommun
      </label>
      <div className="guess-input__field">
        <input
          ref={inputRef}
          id="guess-input"
          type="text"
          role="combobox"
          placeholder="Skriv en kommun"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint={exactMatch ? "send" : "next"}
          aria-autocomplete="list"
          aria-controls={LISTBOX_ID}
          aria-expanded={expanded}
          aria-activedescendant={expanded && highlighted ? optionId(highlighted) : undefined}
          value={text}
          onChange={(event) => {
            setDismissed(false);
            onEvent({ type: "type", text: event.target.value });
          }}
          onFocus={() => setDismissed(false)}
          onBlur={() => setDismissed(true)}
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
      <button type="submit">{counter}</button>
    </form>
  );
}
