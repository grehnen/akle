import { afterAll, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act, createRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { HintRow } from "./HintRow";

const dom = new JSDOM('<!doctype html><html lang="sv"><body></body></html>');
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  IS_REACT_ACT_ENVIRONMENT: true,
});
afterAll(() => {
  for (const name of ["window", "document", "IS_REACT_ACT_ENVIRONMENT"]) {
    Reflect.deleteProperty(globalThis, name);
  }
});

const guessInput = createRef<HTMLInputElement>();

function Row({ hintsTaken }: { hintsTaken: number }) {
  const [hintsUsed, setHintsUsed] = useState(hintsTaken);
  return (
    <>
      <input ref={guessInput} id="guess-input" />
      <HintRow
        finished={false}
        hintsUsed={hintsUsed}
        onTakeHint={() => setHintsUsed((used) => used + 1)}
        focusAfterLastHint={guessInput}
      />
    </>
  );
}

async function clickHint(hintsTaken: number) {
  const container = dom.window.document.createElement("div");
  dom.window.document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(<Row hintsTaken={hintsTaken} />));
  const button = container.querySelector<HTMLButtonElement>(".hint-button");
  button?.focus();
  await act(async () => button?.click());
  const focused = dom.window.document.activeElement;
  const disabled = button?.disabled;
  await act(async () => root.unmount());
  container.remove();
  return { focused: focused === button ? "hint-button" : focused?.id, disabled };
}

test("taking the last hint moves focus to the guess input, not the top of the page", async () => {
  expect(await clickHint(2)).toEqual({ focused: "guess-input", disabled: true });
});

test("taking an earlier hint leaves focus on the Ledtråd button", async () => {
  expect(await clickHint(0)).toEqual({ focused: "hint-button", disabled: false });
});
