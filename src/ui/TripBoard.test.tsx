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
let reducedMotion = false;
const matchMedia = (query: string) => ({
  matches: reducedMotion && query.includes("prefers-reduced-motion"),
  addEventListener() {},
  removeEventListener() {},
});
Object.assign(dom.window, { matchMedia });
// Ge upp's dialog opens with showModal, which jsdom doesn't have.
Object.assign(dom.window.HTMLDialogElement.prototype, {
  showModal(this: HTMLDialogElement) {
    this.open = true;
  },
});
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
  reducedMotion = false;
  if (!mounted) return;
  const { root, container } = mounted;
  act(() => root.unmount());
  container.remove();
  mounted = undefined;
});

async function mount(
  winLingerMs = 0,
  lossLingerMs = 0,
  board = <BareBoard />,
): Promise<HTMLElement> {
  const container = dom.window.document.createElement("div");
  dom.window.document.body.append(container);
  const root = createRoot(container);
  mounted = { root, container };
  await act(async () =>
    root.render(
      <PacingContext value={{ winLingerMs, lossLingerMs, tickMs: 250 }}>{board}</PacingContext>,
    ),
  );
  return container;
}

/** A board on a game played up to here, its give-up allowed so a test can lose at will. */
function BoardOn({ guesses = [], givenUp }: { guesses?: string[]; givenUp?: true }) {
  const [game, setGame] = useState<Game>(() => ({
    trip,
    rules: { guessLimit: "distance", giveUp: true, keepsTime: false },
    guesses,
    givenUp,
  }));
  return (
    <TripBoard graph={graph} game={game} onGameChange={setGame} sessionStorage={memoryStorage()} />
  );
}

const wait = (ms: number) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));

/** Gives up, through the Ge upp button and its dialog. */
async function giveUp(container: HTMLElement) {
  await act(async () => container.querySelector<HTMLElement>(".give-up-button")?.click());
  await act(async () => container.querySelector<HTMLElement>(".give-up-confirm")?.click());
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

  test("a win holds the board for the win's linger, however short a loss's is", async () => {
    const container = await mount(120, 0);
    await guess(container, "Haninge");
    await guess(container, "Salem");

    await wait(40);
    expect(container.querySelector("#result-heading")).toBeNull();
    await wait(120);
    expect(container.querySelector("#result-heading")).not.toBeNull();
  });

  test("a give-up holds the board for the loss's linger, however long a win's is", async () => {
    const container = await mount(60_000, 40, <BoardOn />);
    await giveUp(container);

    expect(container.querySelector("#result-heading")).toBeNull();
    await wait(80);
    expect(container.querySelector("#result-heading")).not.toBeNull();
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

describe("the effect as a trip finishes", () => {
  const glow = (container: HTMLElement) => container.querySelector(".finish-glow");
  const confetti = (container: HTMLElement) => container.querySelector(".finish-confetti");
  const dimmed = (container: HTMLElement) => container.querySelector(".map-frame--dimmed");

  test("a Perfect win gets the gold glow and confetti, with the map undimmed", async () => {
    const container = await mount(60_000);
    await guess(container, "Haninge");
    await guess(container, "Salem");

    expect(glow(container)?.classList.contains("finish-glow--perfect")).toBe(true);
    expect(confetti(container)).not.toBeNull();
    expect(dimmed(container)).toBeNull();
  });

  test("a win that isn't Perfect gets the green glow and no confetti", async () => {
    const container = await mount(60_000);
    await guess(container, "Salem");
    await guess(container, "Haninge");

    expect(glow(container)?.classList.contains("finish-glow--perfect")).toBe(false);
    expect(glow(container)).not.toBeNull();
    expect(confetti(container)).toBeNull();
    expect(dimmed(container)).toBeNull();
  });

  test("a give-up only dims the map", async () => {
    const container = await mount(0, 60_000, <BoardOn />);
    await giveUp(container);

    expect(dimmed(container)).not.toBeNull();
    expect(glow(container)).toBeNull();
    expect(confetti(container)).toBeNull();
  });

  test("nothing plays while the trip is still being played", async () => {
    const container = await mount(60_000);
    await guess(container, "Haninge");

    expect(glow(container)).toBeNull();
    expect(confetti(container)).toBeNull();
    expect(dimmed(container)).toBeNull();
  });

  test("the effect ends when the hold does", async () => {
    const container = await mount(40);
    await guess(container, "Haninge");
    await guess(container, "Salem");
    expect(glow(container)).not.toBeNull();

    await wait(80);
    expect(glow(container)).toBeNull();
  });

  test("a Perfect win's confetti keeps falling after the result opens", async () => {
    const container = await mount(40);
    await guess(container, "Haninge");
    await guess(container, "Salem");

    await wait(80);
    expect(container.querySelector("#result-heading")).not.toBeNull();
    expect(confetti(container)).not.toBeNull();
  });

  test("under reduced motion no confetti appears after the hold either", async () => {
    reducedMotion = true;
    const container = await mount(40);
    await guess(container, "Haninge");
    await guess(container, "Salem");

    await wait(80);
    expect(container.querySelector("#result-heading")).not.toBeNull();
    expect(confetti(container)).toBeNull();
  });

  test("a win reopened from its save plays nothing, even with its result closed", async () => {
    const container = await mount(60_000, 60_000, <BoardOn guesses={["0136", "0128"]} />);
    expect(glow(container)).toBeNull();
    expect(confetti(container)).toBeNull();

    await act(async () => container.querySelector<HTMLElement>(".result-close")?.click());
    expect(container.querySelector(".satellite-map")).not.toBeNull();
    expect(glow(container)).toBeNull();
    expect(confetti(container)).toBeNull();
  });

  test("a give-up reopened from its save leaves the map undimmed", async () => {
    const container = await mount(60_000, 60_000, <BoardOn givenUp />);
    await act(async () => container.querySelector<HTMLElement>(".result-close")?.click());

    expect(container.querySelector(".satellite-map")).not.toBeNull();
    expect(dimmed(container)).toBeNull();
  });

  test("under reduced motion a Perfect win keeps its glow but drops the confetti", async () => {
    reducedMotion = true;
    const container = await mount(60_000);
    await guess(container, "Haninge");
    await guess(container, "Salem");

    expect(glow(container)?.classList.contains("finish-glow--perfect")).toBe(true);
    expect(confetti(container)).toBeNull();
  });
});
