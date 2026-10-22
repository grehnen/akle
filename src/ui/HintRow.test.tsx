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
  const buttons = [...container.querySelectorAll<HTMLButtonElement>(".hint-button")];
  const button = buttons[hintsTaken];
  button?.focus();
  await act(async () => button?.click());
  const focused = dom.window.document.activeElement;
  const enabled = buttons.flatMap((hintButton, index) => (hintButton.disabled ? [] : [index]));
  await act(async () => root.unmount());
  container.remove();
  const focusedHint = buttons.findIndex((hintButton) => hintButton === focused);
  return { focused: focusedHint >= 0 ? `hint ${focusedHint}` : focused?.id, enabled };
}

test("only the topmost hint not yet taken is enabled", async () => {
  const container = dom.window.document.createElement("div");
  dom.window.document.body.append(container);
  const root = createRoot(container);
  for (const hintsTaken of [0, 1, 2, 3]) {
    await act(async () => root.render(<Row key={hintsTaken} hintsTaken={hintsTaken} />));
    const buttons = [...container.querySelectorAll<HTMLButtonElement>(".hint-button")];
    expect(buttons.map((button) => !button.disabled)).toEqual(
      [0, 1, 2].map((index) => index === hintsTaken),
    );
  }
  await act(async () => root.unmount());
  container.remove();
});

test("taking the last hint moves focus to the guess input, not the top of the page", async () => {
  expect(await clickHint(2)).toEqual({ focused: "guess-input", enabled: [] });
});

test("taking an earlier hint moves focus to the next hint button", async () => {
  expect(await clickHint(0)).toEqual({ focused: "hint 1", enabled: [1] });
});
