import { afterAll, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { GuessInput } from "./GuessInput";

const dom = new JSDOM('<!doctype html><html lang="sv"><body></body></html>');
// The on-screen keyboard check asks for media queries; jsdom has no matchMedia.
const matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
Object.assign(dom.window, { matchMedia });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  IS_REACT_ACT_ENVIRONMENT: true,
});
// Imported only now: react-dom checks for a DOM once, when it loads, to pick its event handling.
const { createRoot } = await import("react-dom/client");
afterAll(() => {
  for (const name of ["window", "document", "IS_REACT_ACT_ENVIRONMENT"]) {
    Reflect.deleteProperty(globalThis, name);
  }
});

describe("GuessInput suggestions", () => {
  test("close on Escape or when the input loses focus, and open again when it gets it back", async () => {
    const container = dom.window.document.createElement("div");
    dom.window.document.body.append(container);
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <GuessInput
          text="o"
          suggestions={[{ code: "1880", name: "Örebro" }]}
          highlighted="1880"
          counter="Gissa (0/5)"
          onEvent={() => {}}
        />,
      ),
    );
    const input = container.querySelector("input");
    const listShown = () => container.querySelector('[role="listbox"]') !== null;

    await act(async () => input?.focus());
    expect(listShown()).toBe(true);
    await act(async () => input?.blur());
    expect(listShown()).toBe(false);
    expect(input?.getAttribute("aria-expanded")).toBe("false");
    await act(async () => input?.focus());
    expect(listShown()).toBe(true);

    await act(async () => {
      input?.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(listShown()).toBe(false);

    act(() => root.unmount());
    container.remove();
  });
});
