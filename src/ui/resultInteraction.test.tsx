import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { buildGraphVersion } from "../graph/graphVersion";
import { saveGame } from "../progress/savedGame";
import { type KeyValueStorage, memoryStorage } from "../progress/storage";
import { DailyPuzzleView } from "./DailyPuzzleView";

const dom = new JSDOM('<!doctype html><html lang="sv"><body></body></html>');
// The satellite map asks for the touch-screen media query; jsdom has no matchMedia.
const matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
Object.assign(dom.window, { matchMedia });
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

const graph = buildGraphVersion({
  id: "test",
  startsAtPuzzle: 1,
  kommuner: [
    { code: "0192", name: "Nynäshamn" },
    { code: "0181", name: "Södertälje" },
    { code: "0488", name: "Trosa" },
    { code: "0136", name: "Haninge" },
  ],
  links: [
    { between: ["0192", "0181"], kind: "land" },
    { between: ["0181", "0488"], kind: "land" },
  ],
});

const puzzle = { number: 21, start: "0192", destination: "0488", n: 1 };

let mounted: { root: Root; container: HTMLElement } | undefined;

function unmount() {
  if (!mounted) return;
  const { root, container } = mounted;
  act(() => root.unmount());
  container.remove();
  mounted = undefined;
}

afterEach(unmount);

/** Opens today's finished puzzle (won with Södertälje) as a page load would. */
async function openFinishedGame(sessionStorage: KeyValueStorage, puzzleNumber = puzzle.number) {
  unmount();
  const today = { ...puzzle, number: puzzleNumber };
  const storage = memoryStorage();
  saveGame(storage, { puzzle: today, guesses: ["0181"] });
  const container = dom.window.document.createElement("div");
  dom.window.document.body.append(container);
  const root = createRoot(container);
  mounted = { root, container };
  await act(async () =>
    root.render(
      <DailyPuzzleView
        daily={{ kind: "puzzle", puzzle: today, graph }}
        storage={storage}
        sessionStorage={sessionStorage}
        now={new Date(2026, 9, 21, 13, 5, 9)}
      />,
    ),
  );
  return container;
}

/** A button's accessible name: its aria-label, or its text without the aria-hidden parts. */
function accessibleName(element: Element): string {
  const label = element.getAttribute("aria-label");
  if (label !== null) return label;
  const copy = element.cloneNode(true) as Element;
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
  return (copy.textContent ?? "").trim();
}

function buttonNamed(container: HTMLElement, name: string): HTMLButtonElement {
  const button = [...container.querySelectorAll("button")].find(
    (candidate) => accessibleName(candidate) === name,
  );
  if (!button) throw new Error(`No button named ${name}`);
  return button;
}

const selectedTab = (container: HTMLElement) =>
  container.querySelector('[role="tab"][aria-selected="true"]')?.textContent;

const resultCardOpen = (container: HTMLElement) =>
  container.querySelector('[aria-labelledby="result-heading"]') !== null;

describe("the finished game's result", () => {
  test("Stäng resultat collapses the card into a strip with the score and Dela resultat, bringing back the board", async () => {
    const container = await openFinishedGame(memoryStorage());
    await act(async () => buttonNamed(container, "Stäng resultat").click());

    expect(resultCardOpen(container)).toBe(false);
    const strip = container.querySelector(".result-strip");
    expect(strip?.textContent).toContain("Perfekt!");
    expect(strip?.textContent).toContain("Dela resultat");
    expect(dom.window.document.activeElement?.textContent).toContain("Visa resultat");
    expect(container.querySelector('[aria-label="Karta över Nynäshamn och Trosa"]')).not.toBeNull();
    expect(container.textContent).toContain("Tidigare gissningar");
  });

  test("Visa resultat expands the card again and moves focus to its heading", async () => {
    const container = await openFinishedGame(memoryStorage());
    await act(async () => buttonNamed(container, "Stäng resultat").click());
    await act(async () => buttonNamed(container, "Visa resultat").click());

    expect(resultCardOpen(container)).toBe(true);
    expect(container.querySelector(".result-strip")).toBeNull();
    expect(dom.window.document.activeElement?.id).toBe("result-heading");
  });

  test("stays collapsed after a reload in the same session, but opens for another puzzle", async () => {
    const session = memoryStorage();
    const container = await openFinishedGame(session);
    await act(async () => buttonNamed(container, "Stäng resultat").click());

    expect(resultCardOpen(await openFinishedGame(session))).toBe(false);
    expect(resultCardOpen(await openFinishedGame(session, puzzle.number + 1))).toBe(true);
  });

  test("a clicked tab is selected and kept for the rest of the session", async () => {
    const session = memoryStorage();
    const container = await openFinishedGame(session);
    expect(selectedTab(container)).toBe("Min rutt");
    await act(async () => buttonNamed(container, "Statistik").click());

    expect(selectedTab(container)).toBe("Statistik");
    expect(container.textContent).toContain("Spelade");
    expect(selectedTab(await openFinishedGame(session))).toBe("Statistik");
    expect(selectedTab(await openFinishedGame(session, puzzle.number + 1))).toBe("Statistik");
  });

  test("arrow keys, Home and End move between tabs, selecting and focusing them", async () => {
    const container = await openFinishedGame(memoryStorage());
    const press = (key: string) =>
      act(async () => {
        dom.window.document.activeElement?.dispatchEvent(
          new dom.window.KeyboardEvent("keydown", { key, bubbles: true }),
        );
      });
    buttonNamed(container, "Min rutt").focus();

    await press("ArrowRight");
    expect(selectedTab(container)).toBe("Kortaste rutt");
    expect(dom.window.document.activeElement?.textContent).toBe("Kortaste rutt");
    await press("ArrowLeft");
    await press("ArrowLeft");
    expect(selectedTab(container)).toBe("Statistik");
    await press("Home");
    expect(dom.window.document.activeElement?.textContent).toBe("Min rutt");
    await press("End");
    expect(selectedTab(container)).toBe("Statistik");
  });
});
