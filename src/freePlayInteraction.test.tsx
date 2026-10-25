import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import type { Root } from "react-dom/client";
import { App } from "./App";
import type { DailyTripSource } from "./daily/loadDailyTrip";
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
 * Launch is 2026-11-01 and the tests run before it, on trip #1's version "current"; "later"
 * starts at trip #500 and can't be loaded. The schedule has no trips.
 */
function fakeSource() {
  const fetched: string[] = [];
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
      fetched.push(id);
      if (id !== "current") throw new Error(`no files for ${id}`);
      return currentFiles;
    },
  };
  return { source, fetched };
}

/** A storage that records every write, holding some daily progress already. */
function dailyProgress() {
  const storage = memoryStorage();
  const savedGame = JSON.stringify({ tripNumber: 3, guesses: ["0136"] });
  const history = JSON.stringify({
    2: { won: true, extra: 0, perfect: true, hintsUsed: 0, emojiLine: "✅" },
  });
  storage.setItem("akle:game", savedGame);
  storage.setItem("akle:history", history);
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
  return { storage: recording, writes, savedGame, history };
}

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
/** A test's own stand-in for MapLibre, used instead of {@link loadMap} while set. */
let mapLoaderOverride: LoadMapLibre | undefined;
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
      mapLoaderOverride = undefined;
      for (const draw of waiting) draw();
    });
}

const OPENED_AT = new Date(2026, 9, 24, 12, 0).getTime();
/** The app's clock, which a test moves on to let real time pass, as across a reload or sleep. */
let clockTime = OPENED_AT;
const passTime = (milliseconds: number) => {
  clockTime += milliseconds;
};

afterEach(() => {
  clockTime = OPENED_AT;
  heldMaps = undefined;
  if (!mounted) return;
  const { root, container } = mounted;
  act(() => root.unmount());
  container.remove();
  mounted = undefined;
  copied.length = 0;
  dom.window.history.replaceState(null, "", "/");
});

async function mountApp(
  path: string,
  storage: KeyValueStorage = memoryStorage(),
  sessionStorage: KeyValueStorage = memoryStorage(),
) {
  dom.window.history.replaceState(null, "", path);
  const { pathname, search } = dom.window.location;
  const container = dom.window.document.createElement("div");
  dom.window.document.body.append(container);
  const root = createRoot(container);
  mounted = { root, container };
  const { source, fetched } = fakeSource();
  await act(async () =>
    root.render(
      <App
        source={source}
        now={() => new Date(clockTime)}
        storage={storage}
        sessionStorage={sessionStorage}
        path={pathname}
        search={search}
        pacing={pacing}
        loadMap={mapLoaderOverride ?? loadMap}
      />,
    ),
  );
  return { container, fetched };
}

/** What an element shows on screen, without its words for screen readers only. */
function seenText(element: Element): string {
  const shown = element.cloneNode(true) as Element;
  for (const hidden of shown.querySelectorAll(".visually-hidden")) hidden.remove();
  return shown.textContent ?? "";
}

const query = <E extends Element = HTMLElement>(container: HTMLElement, selector: string) =>
  container.querySelector(selector) as E;

async function type(input: HTMLInputElement, text: string) {
  const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value");
  await act(async () => {
    setValue?.set?.call(input, text);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}

async function click(element: Element) {
  await act(async () => (element as HTMLElement).click());
}

const startField = (container: HTMLElement) =>
  query<HTMLInputElement>(container, "#free-play-start");
const destinationField = (container: HTMLElement) =>
  query<HTMLInputElement>(container, "#free-play-destination");
const resButton = (container: HTMLElement) =>
  [...container.querySelectorAll("button")].find((b) => b.textContent === "Res") as HTMLElement;

/** Each option of a field's open list, as its text and whether it's disabled. */
function options(container: HTMLElement, field: string) {
  return [...container.querySelectorAll(`#${field}-suggestions [role="option"]`)].map((option) => [
    option.textContent,
    option.getAttribute("aria-disabled") === "true",
  ]);
}

describe("getting to free play", () => {
  test("the header's 🎲 opens Fri resa, and Back returns to today's trip", async () => {
    const { container } = await mountApp("/");
    expect(container.textContent).not.toContain("Fri resa");

    await click(query(container, 'header a[aria-label="Fri resa"]'));
    expect(dom.window.location.pathname).toBe("/fri");
    expect(query(container, "#free-play-heading").textContent).toBe("Fri resa");
    expect(dom.window.document.title).toBe("Åkle – Fri resa");

    await act(async () => {
      dom.window.history.back();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(dom.window.location.pathname).toBe("/");
    expect(container.querySelector("#free-play-heading")).toBeNull();
    expect(query(container, "h1").innerHTML).toBe("Åkle");
  });

  test("in free play the title links back to today's trip", async () => {
    const { container } = await mountApp("/fri");

    await click(query(container, "h1 a"));
    expect(dom.window.location.pathname).toBe("/");
    expect(container.querySelector("#free-play-heading")).toBeNull();
  });
});

describe("Välj själv", () => {
  test("tags the other end samma and its neighbors granne, and disables them", async () => {
    const { container } = await mountApp("/fri");

    await type(startField(container), "Haninge");
    await type(destinationField(container), "n");
    expect(options(container, "free-play-destination")).toEqual([
      ["Nynäshamngranne", true],
      ["Haningesamma", true],
    ]);
    expect(resButton(container).hasAttribute("disabled")).toBe(true);
  });

  test("picks by name or SCB code, shows the distance and only then enables Res", async () => {
    const { container } = await mountApp("/fri");
    expect(resButton(container).hasAttribute("disabled")).toBe(true);

    await type(startField(container), "0192");
    expect(resButton(container).hasAttribute("disabled")).toBe(true);
    expect(query(container, ".free-play-distance").textContent).toBe("");

    await type(destinationField(container), "Tro");
    await click(query(container, '#free-play-destination-suggestions [role="option"]'));
    expect(destinationField(container).value).toBe("Trosa");
    expect(query(container, ".free-play-distance").textContent).toBe("Avstånd 2");
    expect(resButton(container).hasAttribute("disabled")).toBe(false);
  });

  test("Enter in Mål plays the trip once both ends are set and no list is open", async () => {
    const { container } = await mountApp("/fri");
    const pressEnter = (field: HTMLInputElement) =>
      act(async () => {
        field.dispatchEvent(
          new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
      });

    await type(startField(container), "Nynäshamn");
    await type(destinationField(container), "Tro");
    await pressEnter(destinationField(container));
    // The open list takes the first Enter: it fills Mål.
    expect(destinationField(container).value).toBe("Trosa");
    expect(container.querySelector("#trip-heading")).toBeNull();

    await pressEnter(destinationField(container));
    expect(query(container, "#trip-heading").textContent).toBe("Res från Nynäshamn till Trosa");
  });

  test("a neighbor typed in full keeps Res disabled", async () => {
    const { container } = await mountApp("/fri");

    await type(startField(container), "Salem");
    await type(destinationField(container), "Trosa");
    expect(query(container, ".free-play-distance").textContent).not.toContain("Avstånd");
    expect(container.textContent).toContain("Start och mål är grannar.");
    expect(resButton(container).hasAttribute("disabled")).toBe(true);
  });
});

describe("playing a picked trip", () => {
  test("plays on trip #1's version before launch, shows the score, and keeps daily progress as it was", async () => {
    const progress = dailyProgress();
    const { container, fetched } = await mountApp("/fri", progress.storage);

    await type(startField(container), "Nynäshamn");
    await type(destinationField(container), "Trosa");
    await click(resButton(container));
    expect(query(container, "#trip-heading").textContent).toBe("Res från Nynäshamn till Trosa");
    expect(container.textContent).toContain("Fri resa · Standard");

    for (const name of ["Haninge", "Salem"]) {
      await type(query<HTMLInputElement>(container, "#guess-input"), name);
      await click(query(container, '.guess-input button[type="submit"]'));
    }
    // A finished game keeps the board up for a moment before the result view opens.
    await settle();

    expect(query(container, "#result-heading").textContent).toBe("Perfekt!");
    expect(query(container, ".result-score").textContent).toBe("+0 (Perfekt) · −1 poäng");
    expect(query(container, ".result-score-note").textContent).toBe("Lägre är bättre");
    expect(fetched).toEqual(["current"]);
    expect(new Set(progress.writes)).toEqual(new Set(["akle:free-play-trips"]));
    expect(progress.storage.getItem("akle:game")).toBe(progress.savedGame);
    expect(progress.storage.getItem("akle:history")).toBe(progress.history);
  });
});

const buttonNamed = (container: HTMLElement, text: string) =>
  [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(text)) as
    | HTMLElement
    | undefined;
const distanceThumbs = (container: HTMLElement) => ({
  min: query<HTMLInputElement>(container, 'input[aria-label="Minsta avstånd"]'),
  max: query<HTMLInputElement>(container, 'input[aria-label="Största avstånd"]'),
});
const KOMMUN_NAMES = ["Nynäshamn", "Haninge", "Salem", "Trosa"];
const pairIn = (heading: string) => KOMMUN_NAMES.filter((name) => heading.includes(name));

/** Wins a trip at distance 1 by guessing the kommun between its ends; returns its heading. */
async function winDistanceOneTrip(container: HTMLElement) {
  const heading = query(container, "#trip-heading").textContent ?? "";
  const between = heading.includes("Nynäshamn") ? "Haninge" : "Salem";
  await type(query<HTMLInputElement>(container, "#guess-input"), between);
  await click(query(container, '.guess-input button[type="submit"]'));
  await settle();
  return heading;
}

describe("Slumpa", () => {
  test("is the open tab, with a distance slider from 1 to the version's largest distance", async () => {
    const { container } = await mountApp("/fri");

    expect(query(container, "#free-play-tab-draw").getAttribute("aria-selected")).toBe("true");
    expect(query(container, "#free-play-panel-draw").hidden).toBe(false);
    expect(query(container, "#free-play-panel-pick").hidden).toBe(true);
    const { min, max } = distanceThumbs(container);
    expect([min.min, min.max, max.min, max.max]).toEqual(["1", "2", "1", "2"]);
    // 3–8 by default, cut down to this version's largest distance, 2.
    expect([min.value, max.value]).toEqual(["2", "2"]);
    expect(query(container, ".free-play-range-label").textContent).toBe("Avstånd 2");
    expect(container.textContent).toContain("Start och mål visas när resan börjar.");
  });

  test("the distance label follows the thumbs", async () => {
    const { container } = await mountApp("/fri");

    await type(distanceThumbs(container).min, "1");
    expect(query(container, ".free-play-range-label").textContent).toBe("Avstånd 1–2");
  });

  test("Välj själv shows its panel instead", async () => {
    const { container } = await mountApp("/fri");

    await click(query(container, "#free-play-tab-pick"));
    expect(query(container, "#free-play-tab-pick").getAttribute("aria-selected")).toBe("true");
    expect(query(container, "#free-play-panel-pick").hidden).toBe(false);
    expect(query(container, "#free-play-panel-draw").hidden).toBe(true);
  });

  test("starts the drawn trip at once, never showing its pair before", async () => {
    const { container } = await mountApp("/fri");
    expect(pairIn(query(container, ".free-play-setup").textContent ?? "")).toEqual([]);

    await click(buttonNamed(container, "Slumpa resa") as HTMLElement);
    // The only pair at distance 2.
    expect(pairIn(query(container, "#trip-heading").textContent ?? "")).toEqual([
      "Nynäshamn",
      "Trosa",
    ]);
    expect(container.textContent).toContain("Fri resa · Standard");
  });

  test("Slumpa ny resa keeps the range and draws the other pair", async () => {
    const { container } = await mountApp("/fri");
    const { min, max } = distanceThumbs(container);
    await type(min, "1");
    await type(max, "1");

    await click(buttonNamed(container, "Slumpa resa") as HTMLElement);
    const first = await winDistanceOneTrip(container);
    await click(buttonNamed(container, "Slumpa ny resa") as HTMLElement);
    const second = await winDistanceOneTrip(container);

    // Distance 1 has two pairs: Nynäshamn–Salem and Haninge–Trosa.
    expect(pairIn(first)).toHaveLength(2);
    expect(pairIn(second)).toHaveLength(2);
    expect(pairIn(second)).not.toEqual(pairIn(first));
    expect(query(container, "#result-heading").textContent).toBe("Perfekt!");
    expect(buttonNamed(container, "Slumpa ny resa")).toBeDefined();
  });

  test("Slumpa ny resa after a picked trip draws from setup's range", async () => {
    const { container } = await mountApp("/fri");

    await click(query(container, "#free-play-tab-pick"));
    await type(startField(container), "Nynäshamn");
    await type(destinationField(container), "Salem");
    await click(resButton(container));
    await winDistanceOneTrip(container);
    expect(query(container, "#result-heading").textContent).toBe("Perfekt!");
    await click(buttonNamed(container, "Slumpa ny resa") as HTMLElement);
    // The default range, cut down to 2, holds only Nynäshamn–Trosa.
    expect(pairIn(query(container, "#trip-heading").textContent ?? "")).toEqual([
      "Nynäshamn",
      "Trosa",
    ]);
  });

  test("Slumpa ny resa after a linked trip draws in its mode from setup's range", async () => {
    const haningeTrosa = tripLinkPath(0, {
      start: "0136",
      destination: "0488",
      mode: { kind: "unlimited" },
    });
    const { container } = await mountApp(haningeTrosa);
    await winDistanceOneTrip(container);

    await click(buttonNamed(container, "Slumpa ny resa") as HTMLElement);
    expect(pairIn(query(container, "#trip-heading").textContent ?? "")).toEqual([
      "Nynäshamn",
      "Trosa",
    ]);
    expect(container.textContent).toContain("Fri resa · Obegränsad");
  });

  test.each([
    ["drawn", undefined],
    ["picked", ["Nynäshamn", "Salem"]],
  ])("a %s trip's result leads back to setup", async (_, picked) => {
    const { container } = await mountApp("/fri");
    if (picked === undefined) {
      const { min, max } = distanceThumbs(container);
      await type(min, "1");
      await type(max, "1");
      await click(buttonNamed(container, "Slumpa resa") as HTMLElement);
    } else {
      await click(query(container, "#free-play-tab-pick"));
      await type(startField(container), picked[0] as string);
      await type(destinationField(container), picked[1] as string);
      await click(resButton(container));
    }
    await winDistanceOneTrip(container);

    const next = [...container.querySelectorAll(".result-header .free-play-next > *")].map(
      (element) => [element.textContent, element.getAttribute("href")],
    );
    expect(next).toEqual([
      ["Välj läge och resa", "/fri"],
      ["Slumpa ny resa", null],
    ]);
  });
});

const address = () => dom.window.location.pathname + dom.window.location.search;

async function playToTheEnd(container: HTMLElement, ...names: string[]) {
  for (const name of names) {
    await type(query<HTMLInputElement>(container, "#guess-input"), name);
    await click(query(container, '.guess-input button[type="submit"]'));
  }
  // A finished game keeps the board up for a moment before the result view opens.
  await settle();
}

describe("trip links", () => {
  const nynashamnTrosa = tripLinkPath(0, {
    start: "0192",
    destination: "0488",
    mode: { kind: "standard" },
  });

  test("a picked trip shows its link while played", async () => {
    const { container } = await mountApp("/fri");
    await type(startField(container), "Nynäshamn");
    await type(destinationField(container), "Trosa");
    await click(resButton(container));
    expect(address()).toBe(nynashamnTrosa);
  });

  test("the share text of a finished trip ends with the link in the address bar", async () => {
    const { container } = await mountApp("/fri");
    await type(startField(container), "Nynäshamn");
    await type(destinationField(container), "Trosa");
    await click(resButton(container));
    await playToTheEnd(container, "Haninge", "Salem");

    await click(query(container, ".share-button"));
    expect(copied).toEqual([
      `#åkle Fri resa · Standard\n+0 (Perfekt) · −1 poäng\n✅✅\nhttps://akle.grehn.net${address()}`,
    ]);
    expect(address()).toBe(nynashamnTrosa);
  });

  test("/fri?r=… opens straight on the trip, showing just its link", async () => {
    const { container, fetched } = await mountApp(`${nynashamnTrosa}&utm_source=chat`);
    expect(query(container, "#trip-heading").textContent).toBe("Res från Nynäshamn till Trosa");
    expect(container.textContent).toContain("Fri resa · Standard");
    expect(address()).toBe(nynashamnTrosa);
    expect(fetched).toEqual(["current"]);
  });

  test.each([
    ["a garbled payload", "/fri?r=EAIFoKICI"],
    [
      "a version that hasn't started",
      tripLinkPath(1, { start: "0192", destination: "0488", mode: { kind: "standard" } }),
    ],
    ["two trips", "/fri?r=EIYFoKAAoAUMXhQwBgdq"],
  ])("%s shows the free-play error screen, never a fallback", async (_, link) => {
    const { container } = await mountApp(link);
    expect(query(container, "#free-play-error-heading").textContent).toBe("Länken fungerar inte");
    expect(container.querySelector("#trip-heading")).toBeNull();
    expect(container.querySelector("#free-play-heading")).toBeNull();
    const links = [...container.querySelectorAll(".free-play-error a")].map((anchor) => [
      anchor.textContent,
      anchor.getAttribute("href"),
    ]);
    expect(links).toEqual([
      ["Fri resa", "/fri"],
      ["Dagens resa", "/"],
    ]);
    expect(query(container, ".free-play-error a.primary-link").getAttribute("href")).toBe("/fri");
  });

  test("an invalid link names its trip when it can", async () => {
    const neighbors = tripLinkPath(0, {
      start: "0136",
      destination: "0128",
      mode: { kind: "standard" },
    });
    const { container } = await mountApp(neighbors);
    expect(query(container, ".free-play-error").textContent).toContain(
      "Resan från Haninge till Salem",
    );
  });
});

/** Unmounts the app and mounts it again on the same storage, as a reload or a reopened tab. */
async function reopen(path: string, storage: KeyValueStorage, sessionStorage?: KeyValueStorage) {
  const { root, container } = mounted as { root: Root; container: HTMLElement };
  act(() => root.unmount());
  container.remove();
  return mountApp(path, storage, sessionStorage);
}

const guessNames = (container: HTMLElement) =>
  [...container.querySelectorAll('ol[aria-label="Gissningar"] li span[aria-hidden="true"]')].map(
    (span) => span.textContent,
  );
const takenHints = (container: HTMLElement) =>
  container.querySelectorAll(".hint-button.taken").length;

async function pick(container: HTMLElement, start: string, destination: string) {
  await type(startField(container), start);
  await type(destinationField(container), destination);
  await click(resButton(container));
}

async function guess(container: HTMLElement, name: string) {
  await type(query<HTMLInputElement>(container, "#guess-input"), name);
  await click(query(container, '.guess-input button[type="submit"]'));
}

const resumeEntry = (container: HTMLElement) =>
  container.querySelector<HTMLAnchorElement>(".free-play-resume") ?? undefined;

describe("resuming the free-play trip", () => {
  const nynashamnTrosa = tripLinkPath(0, {
    start: "0192",
    destination: "0488",
    mode: { kind: "standard" },
  });
  const haningeTrosa = tripLinkPath(0, {
    start: "0136",
    destination: "0488",
    mode: { kind: "standard" },
  });

  test("a reload restores an unfinished trip's guesses and hints", async () => {
    const storage = memoryStorage();
    const { container } = await mountApp("/fri", storage);
    await pick(container, "Nynäshamn", "Trosa");
    await guess(container, "Haninge");
    await click(query(container, ".hint-button"));

    const reloaded = await reopen(address(), storage);
    expect(query(reloaded.container, "#trip-heading").textContent).toBe(
      "Res från Nynäshamn till Trosa",
    );
    expect(guessNames(reloaded.container)).toEqual(["1. Haninge ✅"]);
    expect(takenHints(reloaded.container)).toBe(1);
  });

  test("/fri opens setup with one way back to an unfinished trip, naming its mode and guesses but no kommun", async () => {
    const storage = memoryStorage();
    const { container } = await mountApp("/fri", storage);
    await pick(container, "Nynäshamn", "Trosa");
    await guess(container, "Salem");

    const reopened = await reopen("/fri", storage);
    expect(query(reopened.container, "#free-play-heading").textContent).toBe("Fri resa");
    expect(address()).toBe("/fri");
    expect(reopened.container.querySelectorAll(".free-play-resume")).toHaveLength(1);
    const entry = resumeEntry(reopened.container);
    expect(entry?.textContent).toBe("Fortsätt resan: Standard, 1 gissning");
    expect(entry?.getAttribute("href")).toBe(nynashamnTrosa);
    // After setup's own choices: the mode cards, the tabs and their panels come first.
    const setup = query(reopened.container, ".free-play-setup");
    expect(setup.lastElementChild).toBe(entry as Element);

    await click(entry as Element);
    expect(address()).toBe(nynashamnTrosa);
    expect(guessNames(reopened.container)).toEqual(["1. Salem 🟩"]);
  });

  test("Back from an unfinished trip returns to setup, with the way back to it", async () => {
    const { container } = await mountApp("/fri");
    await pick(container, "Nynäshamn", "Trosa");
    await guess(container, "Haninge");

    await act(async () => {
      dom.window.history.back();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(address()).toBe("/fri");
    expect(query(container, "#free-play-heading").textContent).toBe("Fri resa");
    expect(resumeEntry(container)?.textContent).toBe("Fortsätt resan: Standard, 1 gissning");
  });

  test("the way back is only for the most recently played trip, never an older unfinished one", async () => {
    const storage = memoryStorage();
    const { container } = await mountApp(haningeTrosa, storage);
    await guess(container, "Nynäshamn");
    const finished = await reopen(nynashamnTrosa, storage);
    await playToTheEnd(finished.container, "Haninge", "Salem");

    const setup = await reopen("/fri", storage);
    expect(resumeEntry(setup.container)).toBeUndefined();

    // Opening the unfinished one's link makes it the most recently played again.
    await reopen(haningeTrosa, storage);
    const again = await reopen("/fri", storage);
    expect(resumeEntry(again.container)?.getAttribute("href")).toBe(haningeTrosa);
  });

  test("the exact link to a finished trip reopens its result and share text, with no replay", async () => {
    const storage = memoryStorage();
    const { container } = await mountApp("/fri", storage);
    await pick(container, "Nynäshamn", "Trosa");
    await playToTheEnd(container, "Haninge", "Salem");

    const reopened = await reopen(`${nynashamnTrosa}&utm_source=chat`, storage);
    expect(query(reopened.container, "#result-heading").textContent).toBe("Perfekt!");
    expect(query(reopened.container, ".result-score").textContent).toBe("+0 (Perfekt) · −1 poäng");
    await click(query(reopened.container, ".share-button"));
    expect(copied).toEqual([
      `#åkle Fri resa · Standard\n+0 (Perfekt) · −1 poäng\n✅✅\nhttps://akle.grehn.net${nynashamnTrosa}`,
    ]);
    expect(reopened.container.querySelector("#guess-input")).toBeNull();
  });

  test("/fri opens setup with no way back when the latest trip is finished", async () => {
    const storage = memoryStorage();
    const { container } = await mountApp("/fri", storage);
    await pick(container, "Nynäshamn", "Trosa");
    await playToTheEnd(container, "Haninge", "Salem");

    const reopened = await reopen("/fri", storage);
    expect(query(reopened.container, "#free-play-heading").textContent).toBe("Fri resa");
    expect(address()).toBe("/fri");
    expect(resumeEntry(reopened.container)).toBeUndefined();
    // The latest trip's version is the current one, so it is loaded only once.
    expect(reopened.fetched).toEqual(["current"]);
  });

  test("Back from a finished trip returns to the setup screen", async () => {
    const { container } = await mountApp("/fri");
    await pick(container, "Nynäshamn", "Trosa");
    await playToTheEnd(container, "Haninge", "Salem");

    await act(async () => {
      dom.window.history.back();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(address()).toBe("/fri");
    expect(query(container, "#free-play-heading").textContent).toBe("Fri resa");
  });

  test("opening another trip's link and then this one's resumes it as it was", async () => {
    const storage = memoryStorage();
    const { container } = await mountApp(nynashamnTrosa, storage);
    await guess(container, "Haninge");

    const other = await reopen(haningeTrosa, storage);
    await guess(other.container, "Nynäshamn");
    const back = await reopen(nynashamnTrosa, storage);
    expect(guessNames(back.container)).toEqual(["1. Haninge ✅"]);
    const otherAgain = await reopen(haningeTrosa, storage);
    expect(guessNames(otherAgain.container)).toEqual(["1. Nynäshamn 🟧"]);
  });

  test("a finished trip's link reopens its result after another trip is played", async () => {
    const storage = memoryStorage();
    const { container } = await mountApp(nynashamnTrosa, storage);
    await playToTheEnd(container, "Haninge", "Salem");

    const other = await reopen(haningeTrosa, storage);
    await guess(other.container, "Salem");
    const back = await reopen(nynashamnTrosa, storage);
    expect(query(back.container, "#result-heading").textContent).toBe("Perfekt!");
    expect(back.container.querySelector("#guess-input")).toBeNull();
  });

  test("a trip picked in setup whose link has a save starts afresh, and its link then resumes the new game", async () => {
    const storage = memoryStorage();
    const { container } = await mountApp(nynashamnTrosa, storage);
    await playToTheEnd(container, "Haninge", "Salem");

    const setup = await reopen("/fri", storage);
    await pick(setup.container, "Nynäshamn", "Trosa");
    expect(guessNames(setup.container)).toEqual([]);
    expect(setup.container.querySelector("#guess-input")).not.toBeNull();
    await guess(setup.container, "Haninge");

    const reopened = await reopen(nynashamnTrosa, storage);
    expect(guessNames(reopened.container)).toEqual(["1. Haninge ✅"]);
    expect(reopened.container.querySelector("#guess-input")).not.toBeNull();
  });

  test("a new trip started from setup becomes the way back, in place of the finished one", async () => {
    const storage = memoryStorage();
    const { container } = await mountApp("/fri", storage);
    await pick(container, "Nynäshamn", "Trosa");
    await playToTheEnd(container, "Haninge", "Salem");

    const setup = await reopen("/fri", storage);
    expect(resumeEntry(setup.container)).toBeUndefined();
    await pick(setup.container, "Haninge", "Trosa");

    const resumed = await reopen("/fri", storage);
    expect(resumeEntry(resumed.container)?.getAttribute("href")).toBe(haningeTrosa);
  });

  test("a drawn trip keeps Slumpa ny resa when reopened finished", async () => {
    const storage = memoryStorage();
    const { container } = await mountApp("/fri", storage);
    await click(buttonNamed(container, "Slumpa resa") as HTMLElement);
    await playToTheEnd(container, "Haninge", "Salem");

    const reopened = await reopen(address(), storage);
    expect(buttonNamed(reopened.container, "Slumpa ny resa")).toBeDefined();
  });

  test("Slumpa ny resa on a reopened trip keeps the range it was drawn from", async () => {
    const storage = memoryStorage();
    const { container } = await mountApp("/fri", storage);
    const { min, max } = distanceThumbs(container);
    await type(min, "1");
    await type(max, "1");
    await click(buttonNamed(container, "Slumpa resa") as HTMLElement);
    await winDistanceOneTrip(container);

    const reopened = await reopen(address(), storage);
    await click(buttonNamed(reopened.container, "Slumpa ny resa") as HTMLElement);
    // Still distance 1, not the default range's only pair, Nynäshamn–Trosa at distance 2.
    const heading = query(reopened.container, "#trip-heading").textContent ?? "";
    expect(pairIn(heading)).not.toEqual(["Nynäshamn", "Trosa"]);
    expect(pairIn(heading)).toHaveLength(2);
  });

  test.each([
    ["corrupt", "{not json"],
    [
      "pinned to a version that hasn't started",
      JSON.stringify({
        format: 1,
        versionOrdinal: 1,
        trip: { start: "0192", destination: "0488", mode: { kind: "standard" } },
        drawn: false,
        game: { guesses: [] },
      }),
    ],
    [
      "for kommuner its version lacks",
      JSON.stringify({
        format: 1,
        versionOrdinal: 0,
        trip: { start: "0192", destination: "9999", mode: { kind: "standard" } },
        drawn: false,
        game: { guesses: [] },
      }),
    ],
  ])("a %s old slot is ignored, and /fri opens setup", async (_, slot) => {
    const storage = memoryStorage();
    storage.setItem("akle:free-play-trip", slot);
    const { container } = await mountApp("/fri", storage);
    expect(query(container, "#free-play-heading").textContent).toBe("Fri resa");
    expect(resumeEntry(container)).toBeUndefined();
  });

  test("a readable old slot from before the upgrade resumes from its link, and /fri offers it", async () => {
    const storage = memoryStorage();
    const trip = { start: "0192", destination: "0488", mode: { kind: "standard" } };
    storage.setItem(
      "akle:free-play-trip",
      JSON.stringify({
        format: 1,
        versionOrdinal: 0,
        trip,
        drawn: false,
        game: { guesses: ["0136"] },
      }),
    );
    const { container } = await mountApp("/fri", storage);
    expect(resumeEntry(container)?.textContent).toBe("Fortsätt resan: Standard, 1 gissning");

    const reopened = await reopen(nynashamnTrosa, storage);
    expect(guessNames(reopened.container)).toEqual(["1. Haninge ✅"]);
  });

  test("a save out of shape leaves setup and the other saves working", async () => {
    const storage = memoryStorage();
    const trip = { start: "0192", destination: "0488", mode: { kind: "standard" } };
    storage.setItem(
      "akle:free-play-trips",
      JSON.stringify({
        format: 1,
        saves: [
          { versionOrdinal: 0, trip: { start: "0192" }, drawn: false, game: {} },
          { versionOrdinal: 0, trip, drawn: false, game: { guesses: ["0136"] } },
        ],
      }),
    );
    const { container } = await mountApp("/fri", storage);
    expect(resumeEntry(container)?.textContent).toBe("Fortsätt resan: Standard, 1 gissning");
    const reopened = await reopen(nynashamnTrosa, storage);
    expect(guessNames(reopened.container)).toEqual(["1. Haninge ✅"]);
  });
});

describe("giving up", () => {
  // Nynäshamn to Salem is a distance of 1; Trosa, beyond Salem, is off the route.
  const nynashamnSalem = tripLinkPath(0, {
    start: "0192",
    destination: "0128",
    mode: { kind: "standard" },
  });
  const giveUpButton = (container: HTMLElement) =>
    query<HTMLButtonElement>(container, ".give-up-button");
  const dialog = (container: HTMLElement) =>
    query<HTMLDialogElement>(container, "dialog.give-up-dialog");
  const confirmButton = (container: HTMLElement) =>
    query(container, "dialog.give-up-dialog .give-up-confirm");

  async function giveUpAfterTrosa(container: HTMLElement) {
    await pick(container, "Nynäshamn", "Salem");
    await guess(container, "Trosa");
    await click(giveUpButton(container));
    await click(confirmButton(container));
    // A finished trip keeps the board up for a moment before the result view opens.
    await settle();
  }

  test("Ge upp sits with the hints, enabled from the start", async () => {
    const { container } = await mountApp("/fri");
    await pick(container, "Nynäshamn", "Salem");
    expect(giveUpButton(container).textContent).toBe("Ge upp");
    expect(giveUpButton(container).closest(".hint-section")).not.toBeNull();
    expect(giveUpButton(container).disabled).toBe(false);
  });

  test("giving up before any guess is a loss scored by the same rule", async () => {
    const { container } = await mountApp("/fri");
    await pick(container, "Nynäshamn", "Salem");
    await click(giveUpButton(container));
    await click(confirmButton(container));
    await settle();

    expect(query(container, "#result-heading").textContent).toBe("Gav upp");
    // 0 guesses − distance 1 + 3·1 away.
    expect(query(container, ".result-score").textContent).toBe("Gav upp (1 ifrån) · 2 poäng");
  });

  test("asks before ending the trip, and going back keeps playing", async () => {
    const { container } = await mountApp("/fri");
    await pick(container, "Nynäshamn", "Salem");
    await guess(container, "Trosa");

    await click(giveUpButton(container));
    expect(dialog(container).open).toBe(true);
    await click(query(container, "dialog.give-up-dialog .give-up-cancel"));
    expect(container.querySelector("dialog.give-up-dialog")).toBeNull();
    expect(container.querySelector("#guess-input")).not.toBeNull();
  });

  test("a give-up is a loss headed Gav upp, scored 3 per kommun away, with its share label", async () => {
    const { container } = await mountApp("/fri");
    await giveUpAfterTrosa(container);

    expect(query(container, "#result-heading").textContent).toBe("Gav upp");
    // 1 guess − distance 1 + 3·1 away.
    expect(query(container, ".result-score").textContent).toBe("Gav upp (1 ifrån) · 3 poäng");
    await click(query(container, ".share-button"));
    expect(copied).toEqual([
      `#åkle Fri resa · Standard\nGav upp (1 ifrån) · 3 poäng\n🟧\nhttps://akle.grehn.net${nynashamnSalem}`,
    ]);
  });

  test("a reload or the exact link reopens a given-up trip as given up", async () => {
    const storage = memoryStorage();
    const { container } = await mountApp("/fri", storage);
    await giveUpAfterTrosa(container);
    expect(address()).toBe(nynashamnSalem);

    const reloaded = await reopen(nynashamnSalem, storage);
    expect(query(reloaded.container, "#result-heading").textContent).toBe("Gav upp");
    expect(query(reloaded.container, ".result-score").textContent).toBe(
      "Gav upp (1 ifrån) · 3 poäng",
    );
    expect(reloaded.container.querySelector("#guess-input")).toBeNull();
  });
});

describe("Läge", () => {
  const modeRadios = (container: HTMLElement) => [
    ...container.querySelectorAll<HTMLInputElement>('.free-play-modes input[type="radio"]'),
  ];
  const modeCards = (container: HTMLElement) =>
    modeRadios(container).map((radio) => ({
      name: radio.closest("label")?.querySelector(".free-play-mode-name")?.textContent,
      description: radio.closest("label")?.querySelector(".free-play-mode-description")
        ?.textContent,
      checked: radio.checked,
      disabled: radio.disabled,
    }));
  const modeRadio = (container: HTMLElement, name: string) =>
    modeRadios(container).find(
      (radio) =>
        radio.closest("label")?.querySelector(".free-play-mode-name")?.textContent === name,
    ) as HTMLInputElement;

  test("four mode cards sit above the tabs, Standard chosen, all playable", async () => {
    const { container } = await mountApp("/fri");

    const modes = query(container, "fieldset.free-play-modes");
    expect(modes.querySelector("legend")?.textContent).toBe("Läge");
    expect(
      modes.compareDocumentPosition(query(container, '[role="tablist"]')) &
        dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(modeCards(container)).toEqual([
      {
        name: "Standard",
        description: "Som dagens resa: gissningarna räcker till avståndet och lite till.",
        checked: true,
        disabled: false,
      },
      {
        name: "Obegränsad",
        description: "Gissa hur många gånger du vill. Ge upp när du vill.",
        checked: false,
        disabled: false,
      },
      {
        name: "Tidspress",
        description: "Varje gissning måste göras inom betänketiden.",
        checked: false,
        disabled: false,
      },
      {
        name: "Tidtagning",
        description: "Tiden tas. Vid lika poäng vinner den snabbaste.",
        checked: false,
        disabled: false,
      },
    ]);
  });

  const guessButton = (container: HTMLElement) =>
    query(container, '.guess-input button[type="submit"]');
  const unlimitedLink = (start: string, destination: string) =>
    tripLinkPath(0, { start, destination, mode: { kind: "unlimited" } });

  test("Obegränsad picks the mode for a picked trip: its label, link and plain guess count", async () => {
    const { container } = await mountApp("/fri");
    await click(modeRadio(container, "Obegränsad"));
    expect(modeRadio(container, "Obegränsad").checked).toBe(true);

    await click(query(container, "#free-play-tab-pick"));
    await pick(container, "Nynäshamn", "Trosa");
    expect(container.textContent).toContain("Fri resa · Obegränsad");
    expect(address()).toBe(unlimitedLink("0192", "0488"));

    await guess(container, "Haninge");
    const counter = guessButton(container);
    expect(counter.querySelector('[aria-hidden="true"]')?.textContent).toBe("(2)");
    expect(counter.querySelector(".visually-hidden")?.textContent).toBe("(gissning 2)");
  });

  test("a drawn trip takes the mode, and Slumpa ny resa keeps it", async () => {
    const { container } = await mountApp("/fri");
    await click(modeRadio(container, "Obegränsad"));
    const { min, max } = distanceThumbs(container);
    await type(min, "1");
    await type(max, "1");

    await click(buttonNamed(container, "Slumpa resa") as HTMLElement);
    expect(container.textContent).toContain("Fri resa · Obegränsad");
    await winDistanceOneTrip(container);
    await click(buttonNamed(container, "Slumpa ny resa") as HTMLElement);

    expect(container.textContent).toContain("Fri resa · Obegränsad");
    const code: Record<string, string> = {
      Nynäshamn: "0192",
      Haninge: "0136",
      Salem: "0128",
      Trosa: "0488",
    };
    const [, start, destination] =
      /^Res från (.+) till (.+)$/.exec(query(container, "#trip-heading").textContent ?? "") ?? [];
    expect(address()).toBe(unlimitedLink(code[start], code[destination]));
  });

  test("an unlimited trip's link opens it in its mode, and a reload resumes it", async () => {
    const storage = memoryStorage();
    const link = unlimitedLink("0192", "0488");
    const { container } = await mountApp(link, storage);
    expect(query(container, "#trip-heading").textContent).toBe("Res från Nynäshamn till Trosa");
    expect(container.textContent).toContain("Fri resa · Obegränsad");
    await guess(container, "Haninge");

    const reloaded = await reopen(link, storage);
    expect(reloaded.container.textContent).toContain("Fri resa · Obegränsad");
    expect(guessNames(reloaded.container)).toEqual(["1. Haninge ✅"]);
    expect(address()).toBe(link);
  });

  test("the share text names the mode", async () => {
    const { container } = await mountApp(unlimitedLink("0192", "0488"));
    await playToTheEnd(container, "Haninge", "Salem");

    await click(query(container, ".share-button"));
    expect(copied).toEqual([
      `#åkle Fri resa · Obegränsad\n+0 (Perfekt) · −1 poäng\n✅✅\nhttps://akle.grehn.net${unlimitedLink("0192", "0488")}`,
    ]);
  });
});

describe("Tidtagning", () => {
  const tieBreakerLink = (start: string, destination: string) =>
    tripLinkPath(0, { start, destination, mode: { kind: "tie-breaker" } });
  const NOTICE = "Tiden går även om du lämnar sidan.";
  const startaButton = (container: HTMLElement) => buttonNamed(container, "Starta") as HTMLElement;
  const clockShown = (container: HTMLElement) =>
    query(container, '.trip-clock [role="timer"]').textContent;
  const resultTime = (container: HTMLElement) => query(container, ".result-time").textContent;
  const chooseTieBreaker = (container: HTMLElement) =>
    click(query(container, 'input[name="free-play-mode"][value="tie-breaker"]'));

  test("a picked trip opens hidden behind Starta, which shows its ends and a quiet clock", async () => {
    const { container } = await mountApp("/fri");
    await chooseTieBreaker(container);
    await click(query(container, "#free-play-tab-pick"));
    await pick(container, "Nynäshamn", "Trosa");

    expect(container.querySelector("#trip-heading")).toBeNull();
    expect(container.querySelector("#guess-input")).toBeNull();
    expect(pairIn(container.textContent ?? "")).toEqual([]);
    expect(container.textContent).toContain("Fri resa · Tidtagning");
    expect(container.textContent).toContain(NOTICE);

    await click(startaButton(container));
    expect(query(container, "#trip-heading").textContent).toBe("Res från Nynäshamn till Trosa");
    expect(container.textContent).not.toContain(NOTICE);
    expect(clockShown(container)).toBe("0:00");
    // Visible, sitting above the guess input, but never announced live.
    const clock = query(container, ".trip-clock");
    expect(
      clock.compareDocumentPosition(query(container, "#guess-input")) &
        dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(clock.closest("[aria-live]")).toBeNull();
    expect(clock.querySelector("[aria-live]")).toBeNull();
  });

  test("a drawn trip stays hidden until Starta too", async () => {
    const { container } = await mountApp("/fri");
    await chooseTieBreaker(container);
    await click(buttonNamed(container, "Slumpa resa") as HTMLElement);

    expect(container.querySelector("#trip-heading")).toBeNull();
    expect(pairIn(container.textContent ?? "")).toEqual([]);
    await click(startaButton(container));
    expect(pairIn(query(container, "#trip-heading").textContent ?? "")).toEqual([
      "Nynäshamn",
      "Trosa",
    ]);
  });

  test("a drawn trip reloaded behind Starta keeps Slumpa ny resa and its range", async () => {
    const storage = memoryStorage();
    const session = memoryStorage();
    const { container } = await mountApp("/fri", storage, session);
    await chooseTieBreaker(container);
    const { min, max } = distanceThumbs(container);
    await type(min, "1");
    await type(max, "1");
    await click(buttonNamed(container, "Slumpa resa") as HTMLElement);

    const reloaded = await reopen(address(), storage, session);
    await click(startaButton(reloaded.container));
    await winDistanceOneTrip(reloaded.container);
    await click(buttonNamed(reloaded.container, "Slumpa ny resa") as HTMLElement);
    await click(startaButton(reloaded.container));
    // Still distance 1, not the default range's only pair, Nynäshamn–Trosa at distance 2.
    const heading = query(reloaded.container, "#trip-heading").textContent ?? "";
    expect(pairIn(heading)).not.toEqual(["Nynäshamn", "Trosa"]);
    expect(pairIn(heading)).toHaveLength(2);
  });

  test("a drawn trip keeps Slumpa ny resa across Back and Forward over its Starta", async () => {
    const { container } = await mountApp("/fri");
    await chooseTieBreaker(container);
    await click(buttonNamed(container, "Slumpa resa") as HTMLElement);

    for (const step of ["back", "forward"] as const) {
      await act(async () => {
        dom.window.history[step]();
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
    }
    await click(startaButton(container));
    await playToTheEnd(container, "Haninge", "Salem");
    expect(buttonNamed(container, "Slumpa ny resa")).toBeDefined();
  });

  test("the time shown runs on real time, past an hour as h:mm:ss", async () => {
    const { container } = await mountApp(tieBreakerLink("0192", "0488"));
    await click(startaButton(container));

    // Hidden, backgrounded or asleep: the time shown catches up when it next ticks.
    passTime(65_000);
    await settle();
    expect(clockShown(container)).toBe("1:05");
    passTime(3600_000);
    await settle();
    expect(clockShown(container)).toBe("1:01:05");
  });

  test("a win keeps its time to tenths, from Starta to the winning guess, and shares it", async () => {
    const link = tieBreakerLink("0192", "0488");
    const { container } = await mountApp(link);
    // Time before Starta isn't counted: the trip isn't shown yet.
    passTime(60_000);
    await click(startaButton(container));
    await guess(container, "Haninge");
    passTime(83_456);
    await playToTheEnd(container, "Salem");

    expect(query(container, "#result-heading").textContent).toBe("Perfekt!");
    expect(resultTime(container)).toBe("Tid 1:23,4");
    await click(query(container, ".share-button"));
    expect(copied).toEqual([
      `#åkle Fri resa · Tidtagning\n+0 (Perfekt) · −1 poäng · 1:23,4\n✅✅\nhttps://akle.grehn.net${link}`,
    ]);
  });

  test("time runs on between reloads, and a reopened win keeps its time", async () => {
    const storage = memoryStorage();
    const link = tieBreakerLink("0192", "0488");
    const { container } = await mountApp(link, storage);
    await click(startaButton(container));
    await guess(container, "Haninge");
    passTime(2 * 3600_000 + 5_000);

    // The trip already started, so setup's way back resumes it straight onto the board.
    const setup = await reopen("/fri", storage);
    expect(resumeEntry(setup.container)?.textContent).toBe(
      "Fortsätt resan: Tidtagning, 1 gissning",
    );
    await click(resumeEntry(setup.container) as Element);
    const reloaded = setup;
    expect(address()).toBe(link);
    expect(reloaded.container.textContent).not.toContain(NOTICE);
    expect(clockShown(reloaded.container)).toBe("2:00:05");
    passTime(1_234);
    await playToTheEnd(reloaded.container, "Salem");
    expect(resultTime(reloaded.container)).toBe("Tid 2:00:06,2");

    passTime(60_000);
    const reopened = await reopen(link, storage);
    expect(resultTime(reopened.container)).toBe("Tid 2:00:06,2");
  });

  test("a trip gets its save only at Starta", async () => {
    const storage = memoryStorage();
    const standard = tripLinkPath(0, {
      start: "0192",
      destination: "0488",
      mode: { kind: "standard" },
    });
    const { container } = await mountApp(standard, storage);
    await guess(container, "Haninge");

    // Opened but never started: the standard trip is still the most recently played.
    await reopen(tieBreakerLink("0136", "0488"), storage);
    const notStarted = await reopen("/fri", storage);
    expect(resumeEntry(notStarted.container)?.textContent).toBe(
      "Fortsätt resan: Standard, 1 gissning",
    );

    const opened = await reopen(tieBreakerLink("0136", "0488"), storage);
    await click(startaButton(opened.container));
    const started = await reopen("/fri", storage);
    expect(resumeEntry(started.container)?.textContent).toBe(
      "Fortsätt resan: Tidtagning, 0 gissningar",
    );
  });

  test("a give-up keeps no time, shown as –", async () => {
    // Nynäshamn to Salem is a distance of 1; Trosa is off the route.
    const { container } = await mountApp(tieBreakerLink("0192", "0128"));
    await click(startaButton(container));
    await guess(container, "Trosa");
    await click(query(container, ".give-up-button"));
    await click(query(container, "dialog.give-up-dialog .give-up-confirm"));
    await settle();

    expect(query(container, "#result-heading").textContent).toBe("Gav upp");
    expect(query(container, '.result-time [aria-hidden="true"]').textContent).toBe("–");
    await click(query(container, ".share-button"));
    expect(copied[0]?.split("\n")[1]).toBe("Gav upp (1 ifrån) · 3 poäng");
  });
});

describe("Tidspress", () => {
  const timedLink = (start: string, destination: string, thinkingTime = 10) =>
    tripLinkPath(0, { start, destination, mode: { kind: "timed", thinkingTime } });
  const chooseTimed = (container: HTMLElement) =>
    click(query(container, 'input[name="free-play-mode"][value="timed"]'));
  const thinkingTimeField = (container: HTMLElement) =>
    container.querySelector<HTMLInputElement>('.free-play-modes input[type="range"]');
  const startaButton = (container: HTMLElement) => buttonNamed(container, "Starta") as HTMLElement;

  // Until Tidspress is chosen, its betänketid keeps its place in the card, hidden and inert.
  const isShown = (field: HTMLInputElement | null) =>
    field !== null && field.closest("[inert]") === null;

  test("choosing Tidspress shows its betänketid in its card: 5–60 whole seconds, 10 by default", async () => {
    const { container } = await mountApp("/fri");
    expect(isShown(thinkingTimeField(container))).toBe(false);

    await chooseTimed(container);
    const field = thinkingTimeField(container) as HTMLInputElement;
    expect(field.closest(".free-play-mode")?.textContent).toContain("Tidspress");
    expect(field.labels?.[0]?.textContent).toContain("Betänketid");
    expect([field.min, field.max, field.step, field.value]).toEqual(["5", "60", "1", "10"]);
    expect(query(container, ".free-play-thinking-time output").textContent).toBe("10 s");

    await type(field, "25");
    expect(query(container, ".free-play-thinking-time output").textContent).toBe("25 s");
    // Another mode and back keeps the betänketid.
    await click(query(container, 'input[name="free-play-mode"][value="standard"]'));
    expect(isShown(thinkingTimeField(container))).toBe(false);
    await chooseTimed(container);
    expect(isShown(thinkingTimeField(container))).toBe(true);
    expect(thinkingTimeField(container)?.value).toBe("25");
  });

  test("a picked trip carries its betänketid in its link and label, behind Starta", async () => {
    const { container } = await mountApp("/fri");
    await chooseTimed(container);
    await type(thinkingTimeField(container) as HTMLInputElement, "25");
    await click(query(container, "#free-play-tab-pick"));
    await pick(container, "Nynäshamn", "Trosa");

    expect(container.querySelector("#trip-heading")).toBeNull();
    expect(container.textContent).toContain("Fri resa · Tidspress 25 s");
    expect(address()).toBe(timedLink("0192", "0488", 25));
    await click(startaButton(container));
    expect(query(container, "#trip-heading").textContent).toBe("Res från Nynäshamn till Trosa");
  });

  test("Slumpa ny resa keeps the betänketid", async () => {
    const { container } = await mountApp("/fri");
    await chooseTimed(container);
    await type(thinkingTimeField(container) as HTMLInputElement, "15");
    const { min, max } = distanceThumbs(container);
    await type(min, "1");
    await type(max, "1");
    await click(buttonNamed(container, "Slumpa resa") as HTMLElement);
    await click(startaButton(container));
    await winDistanceOneTrip(container);

    await click(buttonNamed(container, "Slumpa ny resa") as HTMLElement);
    expect(container.textContent).toContain("Fri resa · Tidspress 15 s");
  });

  /** Lets the injected clock's time pass, as the page sees it on coming back into view. */
  async function awhile(milliseconds: number) {
    passTime(milliseconds);
    await act(async () => {
      dom.window.document.dispatchEvent(new dom.window.Event("visibilitychange"));
    });
  }
  const secondsLeft = (container: HTMLElement) =>
    query(container, ".thinking-time-seconds [role='timer']").textContent;
  const announced = (container: HTMLElement) =>
    query(container, ".thinking-time [aria-live='polite']").textContent?.trim();
  async function startedTimedTrip(storage?: KeyValueStorage) {
    const mountedApp = await mountApp(timedLink("0192", "0488"), storage);
    await click(startaButton(mountedApp.container));
    return mountedApp;
  }

  test("Starta starts the thinking time: a bar running down with the seconds left, above the input", async () => {
    const { container } = await startedTimedTrip();
    expect(secondsLeft(container)).toBe("10");
    const bar = query(container, ".thinking-time");
    expect(
      bar.compareDocumentPosition(query(container, "#guess-input")) &
        dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await awhile(3_200);
    expect(secondsLeft(container)).toBe("7");
    expect(bar.classList.contains("thinking-time--warning")).toBe(false);
    // Timed mode keeps no total time.
    expect(container.querySelector(".trip-clock")).toBeNull();
  });

  test("its last third turns a warning colour and bolds the seconds, announced once", async () => {
    const { container } = await startedTimedTrip();
    const bar = query(container, ".thinking-time");
    await awhile(6_500);
    expect(bar.classList.contains("thinking-time--warning")).toBe(false);
    expect(announced(container)).toBe("");

    await awhile(500);
    expect(secondsLeft(container)).toBe("3");
    expect(bar.classList.contains("thinking-time--warning")).toBe(true);
    expect(announced(container)).toBe("3 sekunder kvar");
    // Nothing is announced every second.
    await awhile(1_000);
    expect(secondsLeft(container)).toBe("2");
    expect(announced(container)).toBe("3 sekunder kvar");
  });

  test("the bar moves smoothly, or in whole-second steps under reduced motion", async () => {
    const { container } = await startedTimedTrip();
    await awhile(7_400);
    const fill = query(container, ".thinking-time-fill");
    expect(fill.style.getPropertyValue("--thinking-time-left")).toBe("0.26");
    expect(fill.style.getPropertyValue("--thinking-time-left-step")).toBe("0.3");
  });

  test("a timeout uses no guess, shows as ⏱ and restarts the thinking time", async () => {
    const { container } = await startedTimedTrip();
    await awhile(10_000);

    expect(guessNames(container)).toEqual(["⏱ ×1"]);
    expect(announced(container)).toBe("Tiden ute");
    expect(secondsLeft(container)).toBe("10");
    const counter = query(container, '.guess-input button[type="submit"]');
    expect(counter.querySelector('[aria-hidden="true"]')?.textContent).toBe("(1/6)");
  });

  test("a timeout moves nothing: the ⏱ row has its place held, and no guess is still no guess", async () => {
    const { container } = await startedTimedTrip();
    const list = query(container, 'ol[aria-label="Gissningar"]');
    const heldRow = () => list.lastElementChild as HTMLElement;
    expect(heldRow().classList.contains("timeout-row--held")).toBe(true);
    expect(heldRow().getAttribute("aria-hidden")).toBe("true");

    await awhile(10_000);
    expect(heldRow().classList.contains("timeout-row--held")).toBe(false);
    expect(container.querySelector(".past-guesses .section-empty")?.textContent).toContain(
      "Inga gissningar än",
    );

    await guess(container, "Haninge");
    expect(guessNames(container)).toEqual(["⏱ ×1", "1. Haninge ✅"]);
    expect(heldRow().classList.contains("timeout-row--held")).toBe(true);
  });

  test("only a counted guess restarts it: not an unknown name, a repeat or a hint", async () => {
    const { container } = await startedTimedTrip();
    await awhile(2_000);
    await guess(container, "Haninge");
    expect(secondsLeft(container)).toBe("10");

    await awhile(3_000);
    await guess(container, "Atlantis");
    await guess(container, "Haninge");
    await click(query(container, ".hint-button"));
    expect(secondsLeft(container)).toBe("7");
    await awhile(7_000);
    expect(guessNames(container)).toEqual(["1. Haninge ✅", "⏱ ×1"]);
  });

  test("timeouts while away count on return, as one ⏱ ×n row, and score without Perfect", async () => {
    const link = timedLink("0192", "0488");
    const { container } = await startedTimedTrip();
    await guess(container, "Haninge");
    // Hidden or asleep: five thinking times run out before the page is back.
    await awhile(52_000);
    expect(guessNames(container)).toEqual(["1. Haninge ✅", "⏱ ×5"]);
    expect(secondsLeft(container)).toBe("8");
    expect(announced(container)).toBe("Tiden ute 5 gånger");

    await playToTheEnd(container, "Salem");
    expect(query(container, "#result-heading").textContent).toBe("Framme!");
    expect(seenText(query(container, ".result-score"))).toBe("+0 (5 ⏱) · 5 poäng");
    expect(query(container, ".result-score .visually-hidden").textContent).toBe(
      "Tiden ute 5 gånger",
    );
    expect(container.querySelector(".result-time")).toBeNull();
    await click(query(container, ".share-button"));
    expect(copied).toEqual([
      `#åkle Fri resa · Tidspress 10 s\n+0 (5 ⏱) · 5 poäng\n✅✅\nhttps://akle.grehn.net${link}`,
    ]);
  });

  test("timeouts across a reload count from real time, and the thinking time carries on", async () => {
    const storage = memoryStorage();
    const { container } = await startedTimedTrip(storage);
    await awhile(4_000);
    await guess(container, "Haninge");
    passTime(3600_000 + 2_500);

    const reloaded = await reopen(timedLink("0192", "0488"), storage);
    expect(reloaded.container.querySelector(".start-gate")).toBeNull();
    expect(guessNames(reloaded.container)).toEqual(["1. Haninge ✅", "⏱ ×360"]);
    expect(secondsLeft(reloaded.container)).toBe("8");
  });
});

describe("the board behind Starta", () => {
  const tieBreakerLink = tripLinkPath(0, {
    start: "0192",
    destination: "0488",
    mode: { kind: "tie-breaker" },
  });
  const timedLink = tripLinkPath(0, {
    start: "0192",
    destination: "0488",
    mode: { kind: "timed", thinkingTime: 10 },
  });
  const starta = (container: HTMLElement) => query(container, ".start-gate-button");
  const gate = (container: HTMLElement) => query(container, ".start-gate");
  /** The gate's elements in order, by tag and class: what decides its layout. */
  const gateLayout = (container: HTMLElement) =>
    [...gate(container).querySelectorAll("*")]
      .filter((element) => !element.classList.contains("start-gate-spinner"))
      .map((element) => `${element.tagName}.${element.className}`);
  /** A storage that keeps every value written to it. */
  function recordingStorage() {
    const storage = memoryStorage();
    const written: string[] = [];
    const recording: KeyValueStorage = {
      ...storage,
      setItem: (key, value) => {
        written.push(`${key}=${value}`);
        storage.setItem(key, value);
      },
    };
    return { storage: recording, written };
  }

  test("Starta waits, busy and saying so, until the map is drawn, then says once it's ready", async () => {
    const drawMaps = holdMaps();
    const { container } = await mountApp(tieBreakerLink);
    const loadingLayout = gateLayout(container);

    expect(gate(container).getAttribute("aria-busy")).toBe("true");
    expect(starta(container).getAttribute("aria-disabled")).toBe("true");
    expect(query(container, ".start-gate-status").textContent).toBe("Laddar kartan…");
    expect(query(container, ".start-gate-spinner")).not.toBeNull();
    expect(dom.window.document.activeElement).toBe(starta(container));
    // Pressed too soon, Starta does nothing.
    await click(starta(container));
    expect(container.querySelector("#trip-heading")).toBeNull();

    await drawMaps();
    expect(gate(container).hasAttribute("aria-busy")).toBe(false);
    expect(starta(container).hasAttribute("aria-disabled")).toBe(false);
    const status = query(container, ".start-gate-status");
    expect(status.textContent).toBe("Kartan är klar");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(gateLayout(container)).toEqual(loadingLayout);
    expect(dom.window.document.activeElement).toBe(starta(container));

    await click(starta(container));
    expect(query(container, "#trip-heading").textContent).toBe("Res från Nynäshamn till Trosa");
    expect(dom.window.document.activeElement).toBe(query(container, "#guess-input"));
  });

  test("a ready map leaves focus where the player put it", async () => {
    const drawMaps = holdMaps();
    const { container } = await mountApp(tieBreakerLink);
    const elsewhere = query(container, ".rules-open");
    elsewhere.focus();

    await drawMaps();
    expect(dom.window.document.activeElement).toBe(elsewhere);
  });

  test("no time runs while the map loads: the tie-breaker clock starts at 0:00 at the reveal", async () => {
    const storage = memoryStorage();
    const drawMaps = holdMaps();
    const { container } = await mountApp(tieBreakerLink, storage);
    passTime(30_000);
    await click(starta(container));
    passTime(30_000);
    await drawMaps();
    passTime(5_000);

    await click(starta(container));
    expect(query(container, '.trip-clock [role="timer"]').textContent).toBe("0:00");
    await guess(container, "Haninge");
    passTime(1_500);
    await playToTheEnd(container, "Salem");
    expect(query(container, ".result-time").textContent).toBe("Tid 0:01,5");
  });

  test("no time runs while the map loads: the first betänketid starts full at the reveal", async () => {
    const drawMaps = holdMaps();
    const { container } = await mountApp(timedLink);
    passTime(60_000);
    await drawMaps();
    passTime(4_000);

    await click(starta(container));
    expect(query(container, '.thinking-time [role="timer"]').textContent).toBe("10");
    expect(container.querySelector(".timeout-row:not(.timeout-row--held)")).toBeNull();
    await settle();
  });

  test("the trip's save is written at the reveal, with its start then", async () => {
    const { storage, written } = recordingStorage();
    const drawMaps = holdMaps();
    const { container } = await mountApp(tieBreakerLink, storage);
    await drawMaps();
    passTime(7_000);
    expect(written).toEqual([]);

    await click(starta(container));
    expect(written.at(-1)).toContain(`"startedAt":${clockTime}`);
  });

  test("before the reveal, no end of the trip is named anywhere, and the board is out of reach", async () => {
    const { storage, written } = recordingStorage();
    const session = recordingStorage();
    const drawMaps = holdMaps();
    const { container } = await mountApp("/fri", storage, session.storage);
    await click(query(container, 'input[name="free-play-mode"][value="tie-breaker"]'));
    await click(buttonNamed(container, "Slumpa resa") as HTMLElement);

    const named = () =>
      [
        dom.window.document.body.outerHTML,
        dom.window.document.title,
        ...written,
        ...session.written,
      ].filter((text) => /Nynäshamn|Haninge|Salem|Trosa/.test(text));
    expect(named()).toEqual([]);
    const board = query(container, ".play-screen");
    expect(board.hasAttribute("inert")).toBe(true);
    expect(board.getAttribute("aria-hidden")).toBe("true");
    await drawMaps();
    expect(named()).toEqual([]);
    // The drawn trip's range is still noted for a reload behind Starta.
    expect(session.written).toHaveLength(1);
  });

  test("the reveal shows the board loaded behind Starta, with no second map load", async () => {
    let loads = 0;
    const counting: LoadMapLibre = () => {
      loads += 1;
      return loadMap();
    };
    mapLoaderOverride = counting;
    const drawMaps = holdMaps();
    const { container } = await mountApp(tieBreakerLink);
    const preloaded = query(container, ".satellite-map");
    await drawMaps();

    await click(starta(container));
    expect(query(container, ".satellite-map")).toBe(preloaded);
    expect(preloaded.getAttribute("aria-label")).toBe("Karta över Nynäshamn och Trosa");
    expect(loads).toBe(1);
  });

  test("an untimed trip shows its ends and guess input at once, its map a skeleton until drawn", async () => {
    const drawMaps = holdMaps();
    const { container } = await mountApp(
      tripLinkPath(0, { start: "0192", destination: "0488", mode: { kind: "standard" } }),
    );

    expect(container.querySelector(".start-gate")).toBeNull();
    expect(query(container, "#trip-heading").textContent).toBe("Res från Nynäshamn till Trosa");
    expect(query<HTMLInputElement>(container, "#guess-input").disabled).toBe(false);
    expect(query(container, ".satellite-map .map-skeleton")).not.toBeNull();
    await drawMaps();
    expect(container.querySelector(".map-skeleton")).toBeNull();
  });

  test("a resumed tie-breaker trip keeps real time while its map loads under a skeleton", async () => {
    const storage = memoryStorage();
    const { container } = await mountApp(tieBreakerLink, storage);
    await click(starta(container));
    passTime(65_000);

    const drawMaps = holdMaps();
    const reloaded = await reopen(tieBreakerLink, storage);
    expect(reloaded.container.querySelector(".start-gate")).toBeNull();
    expect(query(reloaded.container, ".map-skeleton")).not.toBeNull();
    expect(query(reloaded.container, '.trip-clock [role="timer"]').textContent).toBe("1:05");
    passTime(5_000);
    await drawMaps();
    await settle();
    expect(query(reloaded.container, '.trip-clock [role="timer"]').textContent).toBe("1:10");
    expect(reloaded.container.querySelector(".map-skeleton")).toBeNull();
    await settle();
  });
});
