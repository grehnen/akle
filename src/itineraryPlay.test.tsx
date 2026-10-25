import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import type { Root } from "react-dom/client";
import { App } from "./App";
import type { DailyTripSource } from "./daily/loadDailyTrip";
import { itineraryLinkPath } from "./freePlay/itineraryLink";
import { encodeLinkPayload, type LinkedTrip } from "./freePlay/linkPayload";
import { tripLinkPath } from "./freePlay/tripLink";
import type { GraphVersionFiles } from "./graph/graphVersionFiles";
import type { LoadMapLibre } from "./map/mapLibreLoader";
import { type KeyValueStorage, memoryStorage } from "./progress/storage";

const dom = new JSDOM('<!doctype html><html lang="sv"><body></body></html>', {
  url: "https://akle.example/",
});
// The satellite map asks for the touch-screen media query; jsdom has no matchMedia.
const matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
Object.assign(dom.window, { matchMedia });
// jsdom doesn't scroll; each scroll the page asks for is recorded instead.
const scrolls: [number, number][] = [];
Object.assign(dom.window, { scrollTo: (x: number, y: number) => void scrolls.push([x, y]) });
// jsdom has no modal dialogs: opening one only marks it open, and closing it fires close.
Object.assign(dom.window.HTMLDialogElement.prototype, {
  showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  },
  close(this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new dom.window.Event("close"));
  },
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  IS_REACT_ACT_ENVIRONMENT: true,
});
// Imported only now: react-dom checks for a DOM once, when it loads, to pick its event handling.
const { createRoot } = await import("react-dom/client");
// What the share button copies.
const copied: string[] = [];
Object.defineProperty(globalThis.navigator, "clipboard", {
  configurable: true,
  value: { writeText: async (text: string) => void copied.push(text) },
});
afterAll(() => {
  for (const name of ["window", "document", "IS_REACT_ACT_ENVIRONMENT"]) {
    Reflect.deleteProperty(globalThis, name);
  }
  Reflect.deleteProperty(globalThis.navigator, "clipboard");
});

// Nynäshamn ── Haninge ── Salem ── Trosa.
const currentFiles: GraphVersionFiles = {
  version: { id: "current", startsAtTrip: 1 },
  kommuner: "code,name\n0192,Nynäshamn\n0136,Haninge\n0128,Salem\n0488,Trosa\n",
  neighbors: "a,b,link\n0192,0136,land\n0136,0128,land\n0128,0488,land\n",
  shapes: { type: "FeatureCollection", features: [] },
};

/**
 * Launch is 2026-11-01 and the tests run before it, on trip #1's version "current", ordinal 0;
 * "later" starts at trip #500 and can't be loaded.
 */
const source: DailyTripSource = {
  scheduleConfig: async () => ({
    epoch: "2026-11-01",
    seed: "test",
    cooldownDays: 30,
    cooldownDaysByGraphVersion: {},
    lanCooldownDays: 3,
    lanCooldownDaysByGraphVersion: {},
  }),
  scheduleChunk: async () => undefined,
  graphVersions: async () => [
    { id: "later", startsAtTrip: 500 },
    { id: "current", startsAtTrip: 1 },
  ],
  graphVersionFiles: async (id) => {
    if (id !== "current") throw new Error(`no files for ${id}`);
    return currentFiles;
  },
};

/** A storage that records every write, holding some daily progress already. */
function dailyProgress() {
  const storage = memoryStorage();
  storage.setItem("akle:game", JSON.stringify({ tripNumber: 3, guesses: ["0136"] }));
  storage.setItem("akle:history", JSON.stringify({ 2: { won: true, extra: 0, perfect: true } }));
  storage.setItem("akle:free-play-trips", "stored trips");
  const writes: string[] = [];
  const recording: KeyValueStorage = {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => {
      writes.push(key);
      storage.setItem(key, value);
    },
    removeItem: (key) => {
      writes.push(key);
      storage.removeItem(key);
    },
  };
  return { storage: recording, writes };
}

const OPENED_AT = new Date(2026, 9, 24, 12, 0).getTime();
/** The app's clock, which a test moves on to let real time pass. */
let clockTime = OPENED_AT;

/** Lingers and ticks shortened, so the tests wait on no real time to speak of. */
const pacing = { finishLingerMs: 0, tickMs: 5 };
/** Lets the shortened linger and a tick or two pass. */
const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 20)));

let mounted: { root: Root; container: HTMLElement } | undefined;

/**
 * Stands in for MapLibre, which jsdom can't run: each map finds none and so is ready at once,
 * unless a test holds the maps back with {@link holdMaps}.
 */
let heldMaps: (() => void)[] | undefined;
const loadMap: LoadMapLibre = () =>
  heldMaps === undefined
    ? Promise.resolve(undefined)
    : new Promise((resolve) => heldMaps?.push(() => resolve(undefined)));
/** Holds every map back from being ready until the returned `drawMaps` is called. */
function holdMaps() {
  heldMaps = [];
  return () =>
    act(async () => {
      const waiting = heldMaps ?? [];
      heldMaps = undefined;
      for (const draw of waiting) draw();
    });
}

afterEach(() => {
  clockTime = OPENED_AT;
  heldMaps = undefined;
  copied.length = 0;
  scrolls.length = 0;
  if (!mounted) return;
  const { root, container } = mounted;
  act(() => root.unmount());
  container.remove();
  mounted = undefined;
  dom.window.history.replaceState(null, "", "/");
});

async function mountApp(path: string, storage: KeyValueStorage = memoryStorage()) {
  dom.window.history.replaceState(null, "", path);
  const { pathname, search } = dom.window.location;
  const container = dom.window.document.createElement("div");
  dom.window.document.body.append(container);
  const root = createRoot(container);
  mounted = { root, container };
  await act(async () =>
    root.render(
      <App
        source={source}
        now={() => new Date(clockTime)}
        storage={storage}
        sessionStorage={memoryStorage()}
        path={pathname}
        search={search}
        pacing={pacing}
        loadMap={loadMap}
      />,
    ),
  );
  // The pinned version loads after the first render.
  await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
  return container;
}

const query = <E extends Element = HTMLElement>(container: HTMLElement, selector: string) =>
  container.querySelector(selector) as E;
/** What an element shows on screen, without its words for screen readers only. */
function seenText(element: Element): string {
  const shown = element.cloneNode(true) as Element;
  for (const hidden of shown.querySelectorAll(".visually-hidden")) hidden.remove();
  return shown.textContent ?? "";
}
const text = (container: HTMLElement, selector: string) =>
  query(container, selector)?.textContent ?? undefined;
const button = (container: HTMLElement, label: string) =>
  [...container.querySelectorAll("button")].find(
    (element) => element.textContent?.trim() === label,
  ) as HTMLButtonElement | undefined;

async function click(element: Element | undefined) {
  if (element === undefined) throw new Error("nothing to click");
  await act(async () => (element as HTMLElement).click());
}

async function type(input: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value");
  await act(async () => {
    setValue?.set?.call(input, value);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}

async function guess(container: HTMLElement, name: string) {
  await type(query<HTMLInputElement>(container, "#guess-input"), name);
  await click(query(container, '.guess-input button[type="submit"]'));
}

/** The summary's rows, each field by its class; a field a trip doesn't have is undefined. */
const summaryRows = (container: HTMLElement) =>
  [...container.querySelectorAll(".itinerary-summary-trip")].map((row) => {
    const field = (name: string) => {
      const element = row.querySelector(`.itinerary-summary-${name}`);
      return element === null ? undefined : seenText(element);
    };
    return {
      pair: field("pair"),
      mode: field("mode"),
      outcome: field("outcome"),
      time: field("time"),
      score: field("score"),
    };
  });

/** A finished trip keeps the board up for a moment before the result view opens. */

const trip = (start: string, destination: string, mode: LinkedTrip["mode"]): LinkedTrip => ({
  start,
  destination,
  mode,
});
// Nynäshamn → Salem and Haninge → Trosa are both at distance 1.
const nynashamnSalem = trip("0192", "0128", { kind: "standard" });
const haningeTrosa = trip("0136", "0488", { kind: "timed", thinkingTime: 10 });
const trosaHaninge = trip("0488", "0136", { kind: "tie-breaker" });
const fridayLink = itineraryLinkPath(0, "Fredagsresan", [
  nynashamnSalem,
  haningeTrosa,
  trosaHaninge,
]);

describe("an itinerary from its link", () => {
  test("a trip's card loads its board behind Starta, which waits for the map; the trip starts at the reveal", async () => {
    const storage = memoryStorage();
    const written: string[] = [];
    const recording: KeyValueStorage = {
      ...storage,
      setItem: (key, value) => {
        written.push(value);
        storage.setItem(key, value);
      },
    };
    const drawMaps = holdMaps();
    const container = await mountApp(
      itineraryLinkPath(0, "Fredagsresan", [haningeTrosa, nynashamnSalem]),
      recording,
    );
    await click(button(container, "Starta resplanen"));

    const starta = query(container, ".start-gate-button");
    expect(starta.getAttribute("aria-disabled")).toBe("true");
    expect(query(container, ".play-screen").hasAttribute("inert")).toBe(true);
    expect(dom.window.document.body.outerHTML).not.toMatch(/Haninge|Trosa/);
    clockTime += 20_000;
    await click(starta);
    expect(container.querySelector("#trip-heading")).toBeNull();
    await drawMaps();
    expect(starta.hasAttribute("aria-disabled")).toBe(false);
    expect(written.join()).not.toContain("startedAt");

    clockTime += 3_000;
    await click(starta);
    expect(text(container, "#trip-heading")).toBe("Från: Haninge Till: Trosa");
    expect(text(container, '.thinking-time [role="timer"]')).toBe("10");
    expect(written.at(-1)).toContain(`"startedAt":${clockTime}`);
  });

  test("opens on its intro: the title, the number of trips and each trip's mode, ends hidden", async () => {
    const container = await mountApp(fridayLink);

    expect(text(container, "#itinerary-intro-heading")).toBe("Fredagsresan");
    expect(text(container, ".itinerary-intro-count")).toBe("3 resor");
    expect(
      [...container.querySelectorAll(".itinerary-intro-trips li")].map((li) => li.textContent),
    ).toEqual(["Standard", "Tidspress 10 s", "Tidtagning"]);
    expect(container.textContent).not.toContain("Nynäshamn");
    expect(container.querySelector("#guess-input")).toBeNull();
    expect(button(container, "Starta resplanen")).toBeDefined();
  });

  test("without a title the intro is headed Resplan", async () => {
    const container = await mountApp(itineraryLinkPath(0, "", [nynashamnSalem, haningeTrosa]));
    expect(text(container, "#itinerary-intro-heading")).toBe("Resplan");
    expect(text(container, ".itinerary-intro-count")).toBe("2 resor");
  });

  test("plays through each trip, a card only before one on the clock, to a total score", async () => {
    const container = await mountApp(fridayLink);
    await click(button(container, "Starta resplanen"));

    // Trip 1: off the clock, so straight on the board under Standard, ready for a guess.
    expect(container.querySelector(".start-gate")).toBeNull();
    expect(text(container, ".trip-number")).toBe(
      "Fredagsresan · Resa 1 av 3 · Standard · Totalt 0 poäng",
    );
    expect(text(container, "#trip-heading")).toContain("Nynäshamn");
    expect(dom.window.document.activeElement?.id).toBe("guess-input");
    expect(container.querySelector(".thinking-time")).toBeNull();
    // No way past a trip being played but to finish it.
    expect(button(container, "Nästa resa")).toBeUndefined();
    await guess(container, "Haninge");
    await settle();

    // Trip end: the result with the shortest route, the trip's score and the running total.
    expect(text(container, "#result-heading")).toBe("Perfekt!");
    expect(container.textContent).toContain("Kortaste rutt");
    expect(text(container, ".result-score")).toBe("+0 (Perfekt) · −1 poäng");
    expect(text(container, ".result-score-note")).toBe("Lägre är bättre");
    expect(text(container, ".itinerary-total")).toBe("Totalt −1 poäng");
    expect(text(container, ".trip-number")).toBe(
      "Fredagsresan · Resa 1 av 3 · Standard · Totalt −1 poäng",
    );
    expect(container.querySelector(".share-button")).toBeNull();
    expect(query(container, ".result-view .itinerary-next").textContent).toBe("Nästa resa");
    await click(button(container, "Nästa resa"));

    // Trip 2: Tidspress, on its card until Starta, its thinking time running from then.
    expect(text(container, ".start-gate .trip-number")).toBe(
      "Fredagsresan · Resa 2 av 3 · Tidspress 10 s · Totalt −1 poäng",
    );
    expect(container.textContent).not.toContain("Trosa");
    expect(container.textContent).toContain("Tiden går även om du lämnar sidan.");
    await click(button(container, "Starta"));
    expect(container.querySelector(".thinking-time")).not.toBeNull();
    // 25 s on one guess: two timeouts, +0 and 2 ⏱ = 2.
    clockTime += 25_000;
    await guess(container, "Salem");
    await settle();
    expect(seenText(query(container, ".result-score"))).toBe("+0 (2 ⏱) · 2 poäng");
    expect(text(container, ".itinerary-total")).toBe("Totalt 1 poäng");
    await click(button(container, "Nästa resa"));

    // Trip 3: Tidtagning, its clock on the board, given up after a wrong guess: 1 − 1 + 3·1.
    expect(text(container, ".start-gate .trip-number")).toBe(
      "Fredagsresan · Resa 3 av 3 · Tidtagning · Totalt 1 poäng",
    );
    await click(button(container, "Starta"));
    expect(container.querySelector(".trip-clock")).not.toBeNull();
    expect(query<HTMLButtonElement>(container, ".give-up-button").disabled).toBe(false);
    await guess(container, "Nynäshamn");
    await click(query(container, ".give-up-button"));
    await click(query(container, "dialog.give-up-dialog .give-up-confirm"));
    await settle();
    expect(text(container, "#result-heading")).toBe("Gav upp");
    expect(text(container, ".result-score")).toBe("Gav upp (1 ifrån) · 3 poäng");
    expect(text(container, ".itinerary-total")).toBe("Totalt 4 poäng");
    expect(container.querySelector(".share-button")).toBeNull();
    expect(button(container, "Nästa resa")).toBeUndefined();
    await click(button(container, "Avsluta resplanen"));

    // The summary: the title, then a row per trip with all it has.
    expect(text(container, "#itinerary-summary-heading")).toBe("Fredagsresan");
    expect(summaryRows(container)).toEqual([
      {
        pair: "Nynäshamn → Salem",
        mode: "Standard",
        outcome: "+0 (Perfekt)",
        time: undefined,
        score: "−1 poäng",
      },
      {
        pair: "Haninge → Trosa",
        mode: "Tidspress 10 s",
        outcome: "+0 (2 ⏱)",
        time: undefined,
        score: "2 poäng",
      },
      {
        pair: "Trosa → Haninge",
        mode: "Tidtagning",
        outcome: "Gav upp (1 ifrån)",
        time: undefined,
        score: "3 poäng",
      },
    ]);
    expect(text(container, ".itinerary-summary-total")).toBe("Totalt 4 poäng");
    expect(text(container, ".itinerary-summary-note")).toBe("Lägre är bättre");
    // A tie-breaker trip, lost: the total time is there, with nothing won.
    expect(text(container, ".itinerary-summary-total-time")).toBe("Total tid 0:00,0 (0 vunna)");
    expect(button(container, "Nästa resa")).toBeUndefined();
    expect(button(container, "Spela igen")).toBeUndefined();

    await click(query(container, ".itinerary-summary .share-button"));
    expect(copied).toEqual([
      [
        "#åkle Resplan · Fredagsresan · 3 resor",
        "Totalt 4 poäng · 0:00,0 (0 vunna)",
        "1. Standard · +0 (Perfekt) · −1 poäng",
        "2. Tidspress 10 s · +0 (2 ⏱) · 2 poäng",
        "3. Tidtagning · Gav upp (1 ifrån) · 3 poäng",
        `https://akle.grehn.net${fridayLink}`,
      ].join("\n"),
    ]);
  });

  test("sums the won tie-breaker trips' time, shows each one's time, and shares it all", async () => {
    const link = itineraryLinkPath(0, "", [trosaHaninge, nynashamnSalem]);
    const container = await mountApp(link);
    await click(button(container, "Starta resplanen"));
    // Untitled, it's named Resplan as on its intro.
    expect(text(container, ".start-gate .trip-number")).toBe(
      "Resplan · Resa 1 av 2 · Tidtagning · Totalt 0 poäng",
    );
    await click(button(container, "Starta"));
    clockTime += 12_340;
    await guess(container, "Salem");
    await settle();
    await click(button(container, "Nästa resa"));
    // Off the clock: Nästa resa puts it straight on the board.
    expect(container.querySelector(".start-gate")).toBeNull();
    expect(text(container, "#trip-heading")).toContain("Nynäshamn");
    expect(dom.window.document.activeElement?.id).toBe("guess-input");
    await click(query(container, ".hint-button"));
    await guess(container, "Haninge");
    await settle();
    await click(button(container, "Avsluta resplanen"));

    expect(text(container, "#itinerary-summary-heading")).toBe("Resplan");
    expect(
      summaryRows(container).map(({ outcome, time, score }) => ({
        outcome,
        time,
        score,
      })),
    ).toEqual([
      { outcome: "+0 (Perfekt)", time: "0:12,3", score: "−1 poäng" },
      { outcome: "+0 (1 ledtråd)", time: undefined, score: "1 poäng" },
    ]);
    expect(text(container, ".itinerary-summary-total")).toBe("Totalt 0 poäng");
    expect(text(container, ".itinerary-summary-total-time")).toBe("Total tid 0:12,3 (1 vunnen)");

    await click(query(container, ".itinerary-summary .share-button"));
    expect(copied).toEqual([
      [
        "#åkle Resplan · 2 resor",
        "Totalt 0 poäng · 0:12,3 (1 vunnen)",
        "1. Tidtagning · +0 (Perfekt) · −1 poäng · 0:12,3",
        "2. Standard · +0 (1 ledtråd) · 1 poäng",
        `https://akle.grehn.net${link}`,
      ].join("\n"),
    ]);
  });

  test("the summary shows no total time without a tie-breaker trip, and leads to today's trip and free play", async () => {
    const container = await mountApp(itineraryLinkPath(0, "", [nynashamnSalem, haningeTrosa]));
    await click(button(container, "Starta resplanen"));
    await guess(container, "Haninge");
    await settle();
    await click(button(container, "Nästa resa"));
    await click(button(container, "Starta"));
    await guess(container, "Salem");
    await settle();
    await click(button(container, "Avsluta resplanen"));

    expect(text(container, ".itinerary-summary-total")).toBe("Totalt −2 poäng");
    expect(container.querySelector(".itinerary-summary-total-time")).toBeNull();
    expect(
      [...container.querySelectorAll(".itinerary-summary-actions a")].map((a) => [
        a.textContent,
        a.getAttribute("href"),
      ]),
    ).toEqual([
      ["Bygg en resplan", "/resplan"],
      ["Dagens resa", "/"],
      ["Fri resa", "/fri"],
    ]);
    expect(
      container.querySelector(".itinerary-summary-actions a.primary-link")?.getAttribute("href"),
    ).toBe("/resplan");
  });

  test("offers no retry: a finished trip's result has no way to play it again", async () => {
    const container = await mountApp(fridayLink);
    await click(button(container, "Starta resplanen"));
    await guess(container, "Haninge");
    await settle();
    const labels = [...container.querySelectorAll("button")].map((b) => b.textContent?.trim());
    expect(labels).not.toContain("Starta");
    expect(labels).not.toContain("Slumpa ny resa");
    expect(container.querySelector("#guess-input")).toBeNull();
  });

  test("leaves trips' saves, streak, stats and history untouched", async () => {
    const { storage, writes } = dailyProgress();
    const container = await mountApp(
      itineraryLinkPath(0, "", [nynashamnSalem, haningeTrosa]),
      storage,
    );
    await click(button(container, "Starta resplanen"));
    await guess(container, "Haninge");
    await settle();
    await click(button(container, "Nästa resa"));
    await click(button(container, "Starta"));
    await guess(container, "Salem");
    await settle();
    await click(button(container, "Avsluta resplanen"));

    // Only the itinerary's save is written.
    expect(new Set(writes)).toEqual(new Set(["akle:itineraries"]));
    expect(storage.getItem("akle:free-play-trips")).toBe("stored trips");
  });
});

/** Leaves the page and opens `path` again on the same storage, as a reload does. */
async function reopen(path: string, storage: KeyValueStorage) {
  if (mounted) {
    const { root, container } = mounted;
    act(() => root.unmount());
    container.remove();
    mounted = undefined;
  }
  return mountApp(path, storage);
}

/** The board's guesses as shown, each its color square and name. */
const guessNames = (container: HTMLElement) =>
  [...container.querySelectorAll('ol[aria-label="Gissningar"] li span[aria-hidden="true"]')].map(
    (span) => span.textContent,
  );

describe("resuming an itinerary", () => {
  test("a reload mid-itinerary returns to its trip, with past results and the trip's guesses", async () => {
    const storage = memoryStorage();
    let container = await mountApp(fridayLink, storage);
    await click(button(container, "Starta resplanen"));
    await guess(container, "Haninge");
    await settle();
    await click(button(container, "Nästa resa"));
    await click(button(container, "Starta"));
    await guess(container, "Nynäshamn");

    container = await reopen(fridayLink, storage);
    expect(text(container, ".trip-number")).toBe(
      "Fredagsresan · Resa 2 av 3 · Tidspress 10 s · Totalt −1 poäng",
    );
    expect(text(container, "#trip-heading")).toContain("Haninge");
    expect(guessNames(container)).toEqual(["1. Nynäshamn 🟧"]);
    await guess(container, "Salem");
    await settle();
    // The first trip's −1 is still in the total: +1 for the wrong guess.
    expect(text(container, ".result-score")).toBe("+1 · 1 poäng");
    expect(text(container, ".itinerary-total")).toBe("Totalt 0 poäng");
  });

  test("a reload on a trip's card returns to the card", async () => {
    const storage = memoryStorage();
    let container = await mountApp(fridayLink, storage);
    await click(button(container, "Starta resplanen"));
    await guess(container, "Haninge");
    await settle();
    await click(button(container, "Nästa resa"));
    container = await reopen(fridayLink, storage);
    expect(text(container, ".start-gate .trip-number")).toBe(
      "Fredagsresan · Resa 2 av 3 · Tidspress 10 s · Totalt −1 poäng",
    );
    expect(button(container, "Starta resplanen")).toBeUndefined();
  });

  test("its exact link, once finished, shows the summary and share text again, with no replay", async () => {
    const storage = memoryStorage();
    const link = itineraryLinkPath(0, "Kort", [nynashamnSalem, haningeTrosa]);
    let container = await mountApp(link, storage);
    await click(button(container, "Starta resplanen"));
    await guess(container, "Haninge");
    await settle();
    await click(button(container, "Nästa resa"));
    await click(button(container, "Starta"));
    await guess(container, "Salem");
    await settle();
    await click(button(container, "Avsluta resplanen"));

    container = await reopen(link, storage);
    expect(text(container, "#itinerary-summary-heading")).toBe("Kort");
    expect(text(container, ".itinerary-summary-total")).toBe("Totalt −2 poäng");
    expect(button(container, "Starta resplanen")).toBeUndefined();
    expect(button(container, "Starta")).toBeUndefined();
    await click(query(container, ".itinerary-summary .share-button"));
    expect(copied[0]?.split("\n")[0]).toBe("#åkle Resplan · Kort · 2 resor");
  });

  test("beginning another itinerary never resets one already begun", async () => {
    const storage = memoryStorage();
    let container = await mountApp(fridayLink, storage);
    await click(button(container, "Starta resplanen"));
    await guess(container, "Trosa");

    // Opened, not begun: it gets no save, so it opens on its intro again.
    const other = itineraryLinkPath(0, "Lördag", [haningeTrosa, nynashamnSalem]);
    container = await reopen(other, storage);
    expect(button(container, "Starta resplanen")).toBeDefined();
    container = await reopen(other, storage);
    expect(button(container, "Starta resplanen")).toBeDefined();

    // Begun: each keeps its own save, and the first goes on where it was.
    await click(button(container, "Starta resplanen"));
    container = await reopen(fridayLink, storage);
    expect(guessNames(container)).toEqual(["1. Trosa 🟧"]);
    container = await reopen(other, storage);
    expect(text(container, ".start-gate .trip-number")).toBe(
      "Lördag · Resa 1 av 2 · Tidspress 10 s · Totalt 0 poäng",
    );
  });

  test("a finished itinerary's link reopens its summary after another is played", async () => {
    const storage = memoryStorage();
    const link = itineraryLinkPath(0, "Kort", [nynashamnSalem, haningeTrosa]);
    let container = await mountApp(link, storage);
    await click(button(container, "Starta resplanen"));
    await guess(container, "Haninge");
    await settle();
    await click(button(container, "Nästa resa"));
    await click(button(container, "Starta"));
    await guess(container, "Salem");
    await settle();
    await click(button(container, "Avsluta resplanen"));

    container = await reopen(fridayLink, storage);
    await click(button(container, "Starta resplanen"));
    container = await reopen(link, storage);
    expect(text(container, "#itinerary-summary-heading")).toBe("Kort");
    expect(button(container, "Starta resplanen")).toBeUndefined();
  });

  test("a free-play trip never touches itineraries' saves", async () => {
    const storage = memoryStorage();
    let container = await mountApp(fridayLink, storage);
    await click(button(container, "Starta resplanen"));
    const stored = storage.getItem("akle:itineraries");

    container = await reopen(tripLinkPath(0, nynashamnSalem), storage);
    await guess(container, "Haninge");
    await settle();
    expect(text(container, "#result-heading")).toBe("Perfekt!");
    expect(storage.getItem("akle:itineraries")).toBe(stored);
  });

  test("a tie-breaker trip's time runs on while the page is closed", async () => {
    const storage = memoryStorage();
    const link = itineraryLinkPath(0, "", [trosaHaninge, nynashamnSalem]);
    let container = await mountApp(link, storage);
    await click(button(container, "Starta resplanen"));
    await click(button(container, "Starta"));
    clockTime += 2_000;

    container = await reopen(link, storage);
    clockTime += 60_000;
    await guess(container, "Salem");
    await settle();
    expect(text(container, ".result-time")).toBe("Tid 1:02,0");
  });

  test("every thinking time that ran out while away counts as a timeout", async () => {
    const storage = memoryStorage();
    const link = itineraryLinkPath(0, "", [haningeTrosa, nynashamnSalem]);
    let container = await mountApp(link, storage);
    await click(button(container, "Starta resplanen"));
    await click(button(container, "Starta"));

    container = await reopen(link, storage);
    // Away for 15 minutes: 90 thinking times of 10 s, uncapped.
    clockTime += 900_000;
    await guess(container, "Salem");
    await settle();
    expect(seenText(query(container, ".result-score"))).toBe("+0 (90 ⏱) · 90 poäng");
  });
});

describe("a trip going on the board", () => {
  const focusedId = () => dom.window.document.activeElement?.id;
  const untimedLink = itineraryLinkPath(0, "", [
    nynashamnSalem,
    trip("0136", "0488", { kind: "unlimited" }),
  ]);

  test("Starta resplanen and Nästa resa onto an untimed trip scroll to the top and focus its input", async () => {
    const container = await mountApp(untimedLink);
    await click(button(container, "Starta resplanen"));
    expect(focusedId()).toBe("guess-input");
    expect(scrolls).toEqual([[0, 0]]);
    await guess(container, "Haninge");
    await settle();

    (dom.window.document.activeElement as HTMLElement | null)?.blur();
    scrolls.length = 0;
    await click(button(container, "Nästa resa"));
    expect(focusedId()).toBe("guess-input");
    expect(scrolls).toEqual([[0, 0]]);
  });

  test("a reload onto a trip leaves focus and scroll alone, but Fortsätt resplanen focuses it", async () => {
    const storage = memoryStorage();
    let container = await mountApp(untimedLink, storage);
    await click(button(container, "Starta resplanen"));
    (dom.window.document.activeElement as HTMLElement | null)?.blur();
    scrolls.length = 0;

    container = await reopen(untimedLink, storage);
    expect(text(container, "#trip-heading")).toContain("Nynäshamn");
    expect(dom.window.document.activeElement).toBe(dom.window.document.body);
    expect(scrolls).toEqual([]);

    container = await reopen("/resplan", storage);
    await click(query(container, ".itinerary-resume"));
    expect(text(container, "#trip-heading")).toContain("Nynäshamn");
    expect(focusedId()).toBe("guess-input");
    expect(scrolls).toEqual([[0, 0]]);
  });
});

describe("the builder's banner", () => {
  const banner = (container: HTMLElement) =>
    query<HTMLAnchorElement>(container, ".itinerary-resume");

  test("links back to an unfinished itinerary, naming its title and trip", async () => {
    const storage = memoryStorage();
    let container = await mountApp(fridayLink, storage);
    await click(button(container, "Starta resplanen"));
    await guess(container, "Haninge");
    await settle();
    await click(button(container, "Nästa resa"));

    container = await reopen("/resplan", storage);
    expect(banner(container).textContent).toBe("Fortsätt resplanen: Fredagsresan, resa 2 av 3");
    expect(banner(container).getAttribute("href")).toBe(fridayLink);
    await click(banner(container));
    expect(dom.window.location.pathname + dom.window.location.search).toBe(fridayLink);
    expect(text(container, ".start-gate .trip-number")).toBe(
      "Fredagsresan · Resa 2 av 3 · Tidspress 10 s · Totalt −1 poäng",
    );
  });

  test("names an untitled itinerary by its trip alone", async () => {
    const storage = memoryStorage();
    const link = itineraryLinkPath(0, "", [nynashamnSalem, haningeTrosa]);
    let container = await mountApp(link, storage);
    await click(button(container, "Starta resplanen"));
    container = await reopen("/resplan", storage);
    expect(banner(container).textContent).toBe("Fortsätt resplanen: resa 1 av 2");
  });

  test("is not there without an unfinished itinerary", async () => {
    const storage = memoryStorage();
    let container = await mountApp("/resplan", storage);
    expect(banner(container)).toBeNull();

    const link = itineraryLinkPath(0, "", [nynashamnSalem, haningeTrosa]);
    container = await reopen(link, storage);
    await click(button(container, "Starta resplanen"));
    await guess(container, "Haninge");
    await settle();
    await click(button(container, "Nästa resa"));
    await click(button(container, "Starta"));
    await guess(container, "Salem");
    await settle();
    await click(button(container, "Avsluta resplanen"));
    container = await reopen("/resplan", storage);
    expect(banner(container)).toBeNull();
  });

  test("is only for the most recently played itinerary, never an older unfinished one", async () => {
    const storage = memoryStorage();
    let container = await mountApp(fridayLink, storage);
    await click(button(container, "Starta resplanen"));

    // A shorter itinerary played to its end after it.
    const link = itineraryLinkPath(0, "", [nynashamnSalem, nynashamnSalem]);
    container = await reopen(link, storage);
    await click(button(container, "Starta resplanen"));
    await guess(container, "Haninge");
    await settle();
    await click(button(container, "Nästa resa"));
    await guess(container, "Haninge");
    await settle();
    await click(button(container, "Avsluta resplanen"));
    container = await reopen("/resplan", storage);
    expect(banner(container)).toBeNull();

    // Opening the unfinished one makes it the most recently played again.
    container = await reopen(fridayLink, storage);
    container = await reopen("/resplan", storage);
    expect(banner(container).textContent).toBe("Fortsätt resplanen: Fredagsresan, resa 1 av 3");
  });
});

describe("an invalid itinerary link", () => {
  const page = (title: string | undefined, payload: string) => {
    const params = new URLSearchParams();
    if (title !== undefined) params.set("namn", title);
    params.set("r", payload);
    return `/resplan?${params}`;
  };
  const packed = (versionOrdinal: number, ...trips: LinkedTrip[]) =>
    encodeLinkPayload({ versionOrdinal, trips });

  test.each([
    ["a bad checksum", page(undefined, `${packed(0, nynashamnSalem, haningeTrosa).slice(0, -1)}A`)],
    [
      "an unknown format version",
      page(undefined, `I${packed(0, nynashamnSalem, haningeTrosa).slice(1)}`),
    ],
    ["one trip", page(undefined, packed(0, nynashamnSalem))],
    ["an ordinal no started version has", page(undefined, packed(1, nynashamnSalem, haningeTrosa))],
    [
      "an unknown code",
      page(undefined, packed(0, nynashamnSalem, trip("0192", "0999", { kind: "standard" }))),
    ],
    ["a title over 40 characters", page("x".repeat(41), packed(0, nynashamnSalem, haningeTrosa))],
  ])("with %s shows the error screen, naming no trip", async (_, path) => {
    const container = await mountApp(path);
    expect(text(container, "#free-play-error-heading")).toBe("Länken fungerar inte");
    expect(text(container, ".free-play-error p")).toBe(
      "Länken till resplanen är trasig eller ogiltig.",
    );
    expect(
      [...container.querySelectorAll(".free-play-error-actions a")].map((a) => [
        a.textContent,
        a.getAttribute("href"),
      ]),
    ).toEqual([
      ["Bygg en resplan", "/resplan"],
      ["Dagens resa", "/"],
      ["Fri resa", "/fri"],
    ]);
    expect(
      container.querySelector(".free-play-error-actions a.primary-link")?.getAttribute("href"),
    ).toBe("/resplan");
    expect(button(container, "Starta resplanen")).toBeUndefined();
  });

  test.each([
    [
      "the same start and destination",
      trip("0128", "0128", { kind: "standard" }),
      "Salem",
      "Salem",
    ],
    ["neighbors", trip("0128", "0488", { kind: "unlimited" }), "Salem", "Trosa"],
  ])("with %s names the trip", async (_, bad, start, destination) => {
    const container = await mountApp(page("Fredag", packed(0, nynashamnSalem, bad)));
    expect(text(container, ".free-play-error p")).toBe(
      `Resan från ${start} till ${destination} i länken kan inte spelas.`,
    );
  });
});
