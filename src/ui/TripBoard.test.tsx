import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act, useState } from "react";
import type { Root } from "react-dom/client";
import { type Game, newGame, type Trip } from "../engine/game";
import { buildGraphVersion } from "../graph/graphVersion";
import { memoryStorage } from "../progress/storage";
import { PacingContext } from "./pacing";
import { TripBoard } from "./TripBoard";

const dom = new JSDOM('<!doctype html><html lang="sv"><body></body></html>');
// The satellite map asks for the touch-screen media query; jsdom has no matchMedia.
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

// Nynäshamn ── Haninge ── Salem ── Trosa: a distance of 2.
const graph = buildGraphVersion({
  id: "test",
  startsAtTrip: 1,
  kommuner: [
    { code: "0192", name: "Nynäshamn" },
    { code: "0136", name: "Haninge" },
    { code: "0128", name: "Salem" },
    { code: "0488", name: "Trosa" },
  ],
  links: [
    { between: ["0192", "0136"], kind: "land" },
    { between: ["0136", "0128"], kind: "land" },
    { between: ["0128", "0488"], kind: "land" },
  ],
});

/** A free-play-like trip: just its endpoints, no trip number. */
const trip: Trip = { start: "0192", destination: "0488" };

/** The board on its own, holding the game the way a screen around it would. */
function BareBoard() {
  const [game, setGame] = useState<Game>(() => newGame(trip));
  return (
    <TripBoard graph={graph} game={game} onGameChange={setGame} sessionStorage={memoryStorage()} />
  );
}

let mounted: { root: Root; container: HTMLElement } | undefined;

afterEach(() => {
  if (!mounted) return;
  const { root, container } = mounted;
  act(() => root.unmount());
  container.remove();
  mounted = undefined;
});

async function mount(finishLingerMs = 0): Promise<HTMLElement> {
  const container = dom.window.document.createElement("div");
  dom.window.document.body.append(container);
  const root = createRoot(container);
  mounted = { root, container };
  await act(async () =>
    root.render(
      <PacingContext value={{ finishLingerMs, tickMs: 250 }}>
        <BareBoard />
      </PacingContext>,
    ),
  );
  return container;
}

/** Types `name` into the guess input and presses Gissa. */
async function guess(container: HTMLElement, name: string) {
  const input = container.querySelector("input") as HTMLInputElement;
  const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value");
  await act(async () => {
    setValue?.set?.call(input, name);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  await act(async () => (container.querySelector('button[type="submit"]') as HTMLElement).click());
}

describe("the board on its own", () => {
  test("plays a trip with no trip number to a win, showing the routes and nothing daily", async () => {
    const container = await mount();
    expect(container.textContent).toContain("Från: Nynäshamn Till: Trosa");

    await guess(container, "Haninge");
    await guess(container, "Salem");
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));

    expect(container.querySelector("#result-heading")?.textContent).toBe("Perfekt!");
    const tabs = [...container.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent);
    expect(tabs).toEqual(["Min rutt", "Kortaste rutt"]);
    expect(container.textContent).not.toContain("Dagens resa");
    expect(container.textContent).not.toContain("Rapportera fel");
    expect(container.textContent).not.toContain("Nästa resa om");
  });

  test("a game finished just now keeps the board up for the linger before the result opens", async () => {
    const container = await mount(60);
    await guess(container, "Haninge");
    await guess(container, "Salem");

    expect(container.querySelector("#result-heading")).toBeNull();
    expect(container.querySelector("#trip-heading")).not.toBeNull();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 100)));
    expect(container.querySelector("#result-heading")?.textContent).toBe("Perfekt!");
  });

  test("a finished trip's board takes no more guesses", async () => {
    const container = await mount(60);
    await guess(container, "Haninge");
    await guess(container, "Salem");

    const input = container.querySelector("#guess-input") as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(
      true,
    );
  });
});
