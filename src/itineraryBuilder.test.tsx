import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import type { Root } from "react-dom/client";
import { App } from "./App";
import type { DailyTripSource } from "./daily/loadDailyTrip";
import { decodeLinkPayload } from "./freePlay/linkPayload";
import type { GraphVersionFiles } from "./graph/graphVersionFiles";
import { type KeyValueStorage, memoryStorage } from "./progress/storage";

const dom = new JSDOM('<!doctype html><html lang="sv"><body></body></html>', {
  url: "https://akle.example/",
});
// The satellite map asks for the touch-screen media query; jsdom has no matchMedia.
const matchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
});
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
// What Kopiera länk copies.
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

// Nynäshamn ── Haninge ── Salem ── Trosa: distance 1 has Nynäshamn–Salem and Haninge–Trosa,
// distance 2 only Nynäshamn–Trosa.
const currentFiles: GraphVersionFiles = {
  version: { id: "current", startsAtTrip: 1 },
  kommuner: "code,name\n0192,Nynäshamn\n0136,Haninge\n0128,Salem\n0488,Trosa\n",
  neighbors: "a,b,link\n0192,0136,land\n0136,0128,land\n0128,0488,land\n",
  shapes: { type: "FeatureCollection", features: [] },
};

/**
 * Launch is 2026-11-01 and the tests run before it, on trip #1's version "current", ordinal 1
 * behind "older"; "later" starts at trip #500. Only "current" can be loaded.
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
    { id: "older", startsAtTrip: 0 },
  ],
  graphVersionFiles: async (id) => {
    if (id !== "current") throw new Error(`no files for ${id}`);
    return currentFiles;
  },
};

let mounted: { root: Root; container: HTMLElement } | undefined;

afterEach(() => {
  if (!mounted) return;
  const { root, container } = mounted;
  act(() => root.unmount());
  container.remove();
  mounted = undefined;
  copied.length = 0;
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
        now={() => new Date(2026, 9, 24, 12, 0)}
        storage={storage}
        sessionStorage={memoryStorage()}
        path={pathname}
        search={search}
      />,
    ),
  );
  return container;
}

const query = <E extends Element = HTMLElement>(container: HTMLElement, selector: string) =>
  container.querySelector(selector) as E;

const button = (container: HTMLElement, text: string) =>
  [...container.querySelectorAll("button")].find(
    (element) => element.textContent?.trim() === text,
  ) as HTMLButtonElement;

async function click(element: Element) {
  await act(async () => (element as HTMLElement).click());
}

describe("getting to the itinerary builder", () => {
  test("the header's 🗺 opens an empty builder on /resplan", async () => {
    const container = await mountApp("/");
    await click(query(container, 'header a[aria-label="Resplan"]'));

    expect(dom.window.location.pathname).toBe("/resplan");
    expect(dom.window.document.title).toBe("Åkle – Resplan");
    expect(query(container, "#itinerary-heading").textContent).toBe("Bygg en resplan");
    expect(query(container, ".itinerary-list-heading").textContent).toBe("Resor");
    expect(query(container, ".itinerary-empty").textContent).toBe(
      "Inga resor än. Lägg till minst två.",
    );
    expect(query(container, ".itinerary-count").textContent).toBe("0 av 20 resor · minst 2");
    expect(button(container, "+ Lägg till").disabled).toBe(false);
    expect(button(container, "Kopiera länk").disabled).toBe(true);
    expect(button(container, "Spela").disabled).toBe(true);
  });
});

async function type(input: HTMLInputElement, text: string) {
  const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value");
  await act(async () => {
    setValue?.set?.call(input, text);
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}

/** Each row of the trip list as its pair's visible text. */
const rows = (container: HTMLElement) =>
  [...container.querySelectorAll(".itinerary-trip-pair")].map((pair) => pair.textContent);
/** Each row's mode, as its read-only text. */
const rowModes = (container: HTMLElement) =>
  [...container.querySelectorAll(".itinerary-trip-mode")].map((mode) => mode.textContent);

const labelled = (container: HTMLElement, label: string) =>
  query<HTMLButtonElement>(container, `[aria-label="${label}"]`);

/** The add modal, while it's open. */
const addModal = (container: HTMLElement) =>
  container.querySelector<HTMLDialogElement>('dialog[aria-label="Lägg till resor"]');
const inModal = <E extends Element = HTMLElement>(container: HTMLElement, selector: string) =>
  addModal(container)?.querySelector(selector) as E;
const modalTab = (container: HTMLElement, name: string) =>
  [...(addModal(container)?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])].find(
    (tab) => tab.textContent === name,
  ) as HTMLButtonElement;
/** The modal footer's button that adds, whatever it reads. */
const submitButton = (container: HTMLElement) =>
  inModal<HTMLButtonElement>(container, ".modal-footer .trip-modal-submit");
/** The Antal slider, found by its label. */
const countSlider = (container: HTMLElement) =>
  [...(addModal(container)?.querySelectorAll<HTMLInputElement>('input[type="range"]') ?? [])].find(
    (input) => input.labels?.[0]?.textContent?.startsWith("Antal"),
  );
const modeRadio = (container: HTMLElement, kind: string) =>
  inModal<HTMLInputElement>(container, `.free-play-modes input[value="${kind}"]`);

async function openAddModal(container: HTMLElement) {
  await click(button(container, "+ Lägg till"));
}

/** Chooses the modal's mode, and Tidspress's betänketid when given. */
async function chooseMode(container: HTMLElement, kind: string, thinkingTime?: number) {
  await click(modeRadio(container, kind));
  if (thinkingTime !== undefined) {
    await type(inModal(container, "input[id$='-thinking-time']"), String(thinkingTime));
  }
}

/** Hand-picks a trip by its ends' names on the modal's Välj själv tab, in `mode`. */
async function pick(
  container: HTMLElement,
  start: string,
  destination: string,
  mode?: { kind: string; thinkingTime?: number },
) {
  await openAddModal(container);
  if (mode) await chooseMode(container, mode.kind, mode.thinkingTime);
  await click(modalTab(container, "Välj själv"));
  await type(inModal(container, "input[id$='-start']"), start);
  await type(inModal(container, "input[id$='-destination']"), destination);
  await click(submitButton(container));
}

/** Adds `count` drawn trips from the modal's Slumpa tab, in `mode`. */
async function draw(container: HTMLElement, count = 1, mode?: { kind: string }) {
  await openAddModal(container);
  if (mode) await chooseMode(container, mode.kind);
  if (count > 1) await type(countSlider(container) as HTMLInputElement, String(count));
  await click(submitButton(container));
}

describe("the add modal", () => {
  test("+ Lägg till opens it with the setup's short texts, on Slumpa", async () => {
    const container = await mountApp("/resplan");
    expect(addModal(container)).toBeNull();
    await openAddModal(container);

    expect(addModal(container)?.open).toBe(true);
    expect(inModal(container, "h2").textContent).toBe("Lägg till resor");
    expect(modeRadio(container, "standard").checked).toBe(true);
    expect(
      modeRadio(container, "standard")
        .closest("label")
        ?.querySelector(".free-play-mode-description")?.textContent,
    ).toBe("Som dagens resa.");
    expect(modalTab(container, "Slumpa").getAttribute("aria-selected")).toBe("true");
    expect(button(container, "Avbryt")).toBeDefined();
  });

  test("a click on the backdrop leaves it open, and Avbryt or Escape closes it", async () => {
    const container = await mountApp("/resplan");
    await openAddModal(container);
    await click(addModal(container) as HTMLDialogElement);
    expect(addModal(container)?.open).toBe(true);

    await click(button(container, "Avbryt"));
    expect(addModal(container)).toBeNull();

    await openAddModal(container);
    await act(async () => {
      addModal(container)?.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
        }),
      );
    });
    expect(addModal(container)).toBeNull();
    expect(rows(container)).toEqual([]);
  });

  test("a hand-picked trip shows its pair, and the modal closes", async () => {
    const container = await mountApp("/resplan");
    await openAddModal(container);
    await click(modalTab(container, "Välj själv"));
    expect(submitButton(container).textContent).toBe("Lägg till");
    expect(submitButton(container).disabled).toBe(true);
    await type(inModal(container, "input[id$='-start']"), "Nynäshamn");
    await type(inModal(container, "input[id$='-destination']"), "Salem");
    expect(inModal(container, ".free-play-distance").textContent).toBe("Avstånd 1");
    await click(submitButton(container));

    expect(addModal(container)).toBeNull();
    expect(rows(container)).toEqual(["Nynäshamn → Salem"]);
    expect(rowModes(container)).toEqual(["Standard"]);
    expect(container.querySelector(".itinerary-empty")).toBeNull();
    expect(query(container, ".itinerary-count").textContent).toBe("1 av 20 resor · minst 2");
  });

  test("Välj själv can't add a trip to the same kommun or a neighbor", async () => {
    const container = await mountApp("/resplan");
    await openAddModal(container);
    await click(modalTab(container, "Välj själv"));
    await type(inModal(container, "input[id$='-start']"), "Nynäshamn");
    await type(inModal(container, "input[id$='-destination']"), "Haninge");
    expect(submitButton(container).disabled).toBe(true);
    await type(inModal(container, "input[id$='-destination']"), "Nynäshamn");
    expect(submitButton(container).disabled).toBe(true);
  });

  test("it opens on the mode and range last used this visit, and not after a reload", async () => {
    const storage = memoryStorage();
    const container = await mountApp("/resplan", storage);
    await openAddModal(container);
    await chooseMode(container, "timed", 17);
    const [minimum] = inModal(container, ".distance-range").querySelectorAll("input");
    await type(minimum as HTMLInputElement, "1");
    await click(submitButton(container));

    await openAddModal(container);
    expect(modeRadio(container, "timed").checked).toBe(true);
    expect(inModal(container, ".free-play-thinking-time output").textContent).toBe("17 s");
    expect(inModal(container, ".free-play-range-label").textContent).toBe("Avstånd 1–2");
    await click(button(container, "Avbryt"));
    unmount();

    const reloaded = await mountApp("/resplan", storage);
    await openAddModal(reloaded);
    expect(modeRadio(reloaded, "standard").checked).toBe(true);
    expect(inModal(reloaded, ".free-play-range-label").textContent).toBe("Avstånd 2");
  });
});

describe("drawing trips", () => {
  test("Antal adds that many drawn trips, its button counting them", async () => {
    const container = await mountApp("/resplan");
    await openAddModal(container);
    // The four-kommun path's largest distance is 2, so the range is 2–2: Nynäshamn–Trosa.
    expect(inModal(container, ".free-play-range-label").textContent).toBe("Avstånd 2");
    const slider = countSlider(container) as HTMLInputElement;
    expect([slider.min, slider.max, slider.value]).toEqual(["1", "20", "1"]);
    expect(submitButton(container).textContent).toBe("Lägg till 1 resa");
    await type(slider, "3");
    expect(slider.labels?.[0]?.textContent).toBe("Antal 3 av högst 20");
    expect(submitButton(container).textContent).toBe("Lägg till 3 resor");
    await click(submitButton(container));

    expect(addModal(container)).toBeNull();
    expect(rows(container)).toEqual(Array(3).fill("Slumpad · avstånd 2"));
    expect(container.querySelector(".itinerary-trips")?.textContent).not.toContain("Nynäshamn");
  });

  test("Antal resets to 1 on each open, up to the slots left, and hides at one slot", async () => {
    const container = await mountApp("/resplan");
    await draw(container, 15);
    await openAddModal(container);
    const slider = countSlider(container) as HTMLInputElement;
    expect([slider.max, slider.value]).toEqual(["5", "1"]);
    await type(slider, "4");
    await click(submitButton(container));

    await openAddModal(container);
    expect(countSlider(container)).toBeUndefined();
    expect(submitButton(container).textContent).toBe("Lägg till 1 resa");
  });

  test("Antal is only on Slumpa", async () => {
    const container = await mountApp("/resplan");
    await openAddModal(container);
    await click(modalTab(container, "Välj själv"));
    expect(countSlider(container)?.closest("[hidden]")).not.toBeNull();
  });

  test("a drawn row shows the range it was drawn from, never its pair", async () => {
    const container = await mountApp("/resplan");
    await openAddModal(container);
    const [minimum] = inModal(container, ".distance-range").querySelectorAll("input");
    await type(minimum as HTMLInputElement, "1");
    await click(submitButton(container));

    expect(rows(container)).toEqual(["Slumpad · avstånd 1–2"]);
    expect(button(container, "Visa")).toBeUndefined();
    expect(container.querySelector(".itinerary-trips select")).toBeNull();
    expect(container.querySelector(".itinerary-trips")?.textContent).not.toContain("🎲");
  });
});

/** What the builder last announced, as a screen reader hears it. */
const announced = (container: HTMLElement) =>
  query(container, ".itinerary-announcer").textContent?.trim();
const focused = () => dom.window.document.activeElement;

describe("announcing added trips", () => {
  test("adding announces the trips and focuses + Lägg till again", async () => {
    const container = await mountApp("/resplan");
    await pick(container, "Nynäshamn", "Salem");
    expect(announced(container)).toBe("Resa 1 tillagd");
    expect(focused()).toBe(button(container, "+ Lägg till"));
    await draw(container, 5);
    expect(announced(container)).toBe("5 resor tillagda");
  });

  test("the add that fills the itinerary moves focus to the bar's count", async () => {
    const container = await mountApp("/resplan");
    await draw(container, 20);
    expect(announced(container)).toBe("20 resor tillagda");
    expect(focused()).toBe(query(container, ".itinerary-count"));
  });
});

describe("a full itinerary", () => {
  test("at 20 trips + Lägg till and duplicating are disabled, until a trip is removed", async () => {
    const container = await mountApp("/resplan");
    await draw(container, 20);

    expect(query(container, ".itinerary-count").textContent).toBe("20 av 20 resor");
    expect(button(container, "+ Lägg till (fullt)").disabled).toBe(true);
    expect(labelled(container, "Dubblera resa 1").disabled).toBe(true);

    await click(labelled(container, "Ta bort resa 20"));
    expect(button(container, "+ Lägg till").disabled).toBe(false);
  });
});

describe("editing the trip list", () => {
  test("trips can be reordered, duplicated with their mode and range and removed", async () => {
    const container = await mountApp("/resplan");
    await pick(container, "Nynäshamn", "Salem", { kind: "unlimited" });
    await pick(container, "Haninge", "Trosa", { kind: "standard" });

    await pressKey(handle(container, 1), "ArrowDown");
    expect(rows(container)).toEqual(["Haninge → Trosa", "Nynäshamn → Salem"]);

    await click(labelled(container, "Dubblera resa 2"));
    expect(rows(container)).toEqual(["Haninge → Trosa", "Nynäshamn → Salem", "Nynäshamn → Salem"]);
    expect(rowModes(container)).toEqual(["Standard", "Obegränsad", "Obegränsad"]);

    await click(labelled(container, "Ta bort resa 1"));
    expect(rows(container)).toEqual(["Nynäshamn → Salem", "Nynäshamn → Salem"]);
  });

  test("a duplicated drawn trip copies its range", async () => {
    const container = await mountApp("/resplan");
    await draw(container);
    await click(labelled(container, "Dubblera resa 1"));
    expect(rows(container)).toEqual(["Slumpad · avstånd 2", "Slumpad · avstånd 2"]);
  });
});

const handle = (container: HTMLElement, number: number) =>
  labelled(container, `Flytta resa ${number}`);

async function pressKey(element: Element, key: string) {
  await act(async () => {
    element.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

const ROW_HEIGHT = 50;
/** Gives each row the place its position in the list would, as jsdom does no layout. */
function layOutRows(container: HTMLElement) {
  for (const row of container.querySelectorAll<HTMLElement>(".itinerary-trip")) {
    row.getBoundingClientRect = () => {
      const top = [...(row.parentElement?.children ?? [])].indexOf(row) * ROW_HEIGHT;
      return { top, bottom: top + ROW_HEIGHT, height: ROW_HEIGHT } as DOMRect;
    };
  }
}

/** Presses `element` at height `from` and moves, then releases, at each height of `to`. */
async function dragTo(element: Element, from: number, ...to: number[]) {
  const pointer = (kind: string, clientY: number) =>
    new dom.window.MouseEvent(kind, { clientY, bubbles: true });
  await act(async () => void element.dispatchEvent(pointer("pointerdown", from)));
  for (const clientY of to) {
    await act(async () => void dom.window.dispatchEvent(pointer("pointermove", clientY)));
  }
  await act(async () => void dom.window.dispatchEvent(pointer("pointerup", to.at(-1) ?? from)));
}

/** Three hand-picked trips, in rows 1, 2 and 3. */
async function pickThree(container: HTMLElement) {
  await pick(container, "Nynäshamn", "Salem");
  await pick(container, "Haninge", "Trosa");
  await pick(container, "Nynäshamn", "Trosa");
  layOutRows(container);
}
const THREE = ["Nynäshamn → Salem", "Haninge → Trosa", "Nynäshamn → Trosa"];

describe("reordering the trip list", () => {
  test("the ↑↓ buttons are gone; the rows keep ✎ ⧉ and ✕ and get a ⠿ handle", async () => {
    const container = await mountApp("/resplan");
    await pickThree(container);
    expect(container.querySelector('[aria-label^="Flytta upp"]')).toBeNull();
    expect(container.querySelector('[aria-label^="Flytta ner"]')).toBeNull();
    expect(handle(container, 2).textContent).toBe("⠿");
    expect(labelled(container, "Dubblera resa 2")).toBeDefined();
    expect(labelled(container, "Ta bort resa 2")).toBeDefined();
  });

  test("dragging a row's handle down moves the row to where it's dropped", async () => {
    const container = await mountApp("/resplan");
    await pickThree(container);
    await dragTo(handle(container, 1), 25, 80, 125);
    expect(rows(container)).toEqual([THREE[1], THREE[2], THREE[0]]);
    expect(announced(container)).toBe("Resa flyttad till plats 3 av 3");
  });

  test("dragging a row up moves it above the rows it passes", async () => {
    const container = await mountApp("/resplan");
    await pickThree(container);
    await dragTo(handle(container, 3), 125, 70, 20);
    expect(rows(container)).toEqual([THREE[2], THREE[0], THREE[1]]);
    expect(announced(container)).toBe("Resa flyttad till plats 1 av 3");
  });

  test("a drag that stays within its row changes and announces nothing", async () => {
    const container = await mountApp("/resplan");
    await pickThree(container);
    const before = announced(container);
    await dragTo(handle(container, 2), 75, 85, 70);
    expect(rows(container)).toEqual(THREE);
    expect(announced(container)).toBe(before);
  });

  test("a row can be dragged past the ends of the list", async () => {
    const container = await mountApp("/resplan");
    await pickThree(container);
    await dragTo(handle(container, 2), 75, 400);
    expect(rows(container)).toEqual([THREE[0], THREE[2], THREE[1]]);
    await dragTo(handle(container, 3), 125, -300);
    expect(rows(container)).toEqual([THREE[1], THREE[0], THREE[2]]);
  });

  test("the dragged row is lifted while the pointer is down, and keeps its handle focused", async () => {
    const container = await mountApp("/resplan");
    await pickThree(container);
    const down = new dom.window.MouseEvent("pointerdown", { clientY: 25, bubbles: true });
    await act(async () => void handle(container, 1).dispatchEvent(down));
    expect(container.querySelectorAll(".itinerary-trip--dragged")).toHaveLength(1);
    expect(focused()).toBe(handle(container, 1));
    await act(async () =>
      dom.window.dispatchEvent(new dom.window.MouseEvent("pointerup", { clientY: 25 })),
    );
    expect(container.querySelector(".itinerary-trip--dragged")).toBeNull();
  });

  test("the new order is kept in the draft and the link", async () => {
    const storage = memoryStorage();
    const container = await mountApp("/resplan", storage);
    await pickThree(container);
    await click(button(container, "Kopiera länk"));
    const linkBefore = copied.at(-1);
    await dragTo(handle(container, 1), 25, 125);
    await click(button(container, "Kopiera länk"));
    expect(copied.at(-1)).not.toBe(linkBefore);
    unmount();

    const reloaded = await mountApp("/resplan", storage);
    expect(rows(reloaded)).toEqual([THREE[1], THREE[2], THREE[0]]);
  });

  test("the focused handle moves its row with ArrowUp and ArrowDown, and keeps focus", async () => {
    const container = await mountApp("/resplan");
    await pickThree(container);
    await pressKey(handle(container, 1), "ArrowDown");
    expect(rows(container)).toEqual([THREE[1], THREE[0], THREE[2]]);
    expect(announced(container)).toBe("Resa flyttad till plats 2 av 3");
    expect(focused()).toBe(handle(container, 2));

    await pressKey(handle(container, 2), "ArrowDown");
    expect(rows(container)).toEqual([THREE[1], THREE[2], THREE[0]]);
    expect(announced(container)).toBe("Resa flyttad till plats 3 av 3");
    expect(focused()).toBe(handle(container, 3));

    await pressKey(handle(container, 3), "ArrowUp");
    expect(rows(container)).toEqual([THREE[1], THREE[0], THREE[2]]);
    expect(focused()).toBe(handle(container, 2));
  });

  test("the first row can't go up and the last can't go down", async () => {
    const container = await mountApp("/resplan");
    await pickThree(container);
    const before = announced(container);
    await pressKey(handle(container, 1), "ArrowUp");
    await pressKey(handle(container, 3), "ArrowDown");
    expect(rows(container)).toEqual(THREE);
    expect(announced(container)).toBe(before);
  });
});

/** The edit modal, while it's open. */
const editModal = (container: HTMLElement) =>
  container.querySelector<HTMLDialogElement>('dialog[aria-label="Ändra resa"]');
const inEditModal = <E extends Element = HTMLElement>(container: HTMLElement, selector: string) =>
  editModal(container)?.querySelector(selector) as E;
const editModalButton = (container: HTMLElement, text: string) =>
  [...(editModal(container)?.querySelectorAll("button") ?? [])].find(
    (element) => element.textContent?.trim() === text,
  ) as HTMLButtonElement;
const editModalTab = (container: HTMLElement, name: string) =>
  [...(editModal(container)?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])].find(
    (tab) => tab.textContent === name,
  ) as HTMLButtonElement;

/** Adds one drawn trip from the distance range `min`–`max`, in Tidspress with 17 s. */
async function drawTimedInRange(container: HTMLElement, min: number, max: number) {
  await openAddModal(container);
  await chooseMode(container, "timed", 17);
  const [minimum, maximum] = inModal(container, ".distance-range").querySelectorAll("input");
  await type(minimum as HTMLInputElement, String(min));
  await type(maximum as HTMLInputElement, String(max));
  await click(submitButton(container));
}

/** The itinerary's trips as its copied link carries them: each pair as "start-destination". */
async function linkedPairs(container: HTMLElement) {
  copied.length = 0;
  await click(button(container, "Kopiera länk"));
  const decoded = decodeLinkPayload(new URL(copied[0]).searchParams.get("r") ?? "");
  if (!decoded.ok) throw new Error("the copied link didn't decode");
  return decoded.payload.trips.map(({ start, destination }) => `${start}-${destination}`);
}

describe("editing a trip", () => {
  test("✎ on a drawn row opens the modal on its mode and range, with no Antal and no Slumpa om", async () => {
    const container = await mountApp("/resplan");
    await drawTimedInRange(container, 1, 2);
    await click(labelled(container, "Ändra resa 1"));

    expect(editModal(container)?.open).toBe(true);
    expect(inEditModal(container, "h2").textContent).toBe("Ändra resa");
    expect(inEditModal<HTMLInputElement>(container, 'input[value="timed"]').checked).toBe(true);
    expect(inEditModal(container, ".free-play-thinking-time output").textContent).toBe("17 s");
    expect(editModalTab(container, "Slumpa").getAttribute("aria-selected")).toBe("true");
    expect(inEditModal(container, ".free-play-range-label").textContent).toBe("Avstånd 1–2");
    expect(editModal(container)?.textContent).not.toContain("Antal");
    expect(editModal(container)?.textContent).not.toContain("Slumpa om");
    expect(editModalButton(container, "Spara")).toBeDefined();
  });

  test("Spara on Slumpa draws a new pair, keeping the mode and range, and the row still shows only the range", async () => {
    const container = await mountApp("/resplan");
    // Distance 1 has only two pairs, so a new pair is always the other one.
    await drawTimedInRange(container, 1, 1);
    await click(labelled(container, "Dubblera resa 1"));
    const [first, second] = await linkedPairs(container);
    expect(second).toBe(first);

    await click(labelled(container, "Ändra resa 2"));
    await click(editModalButton(container, "Spara"));

    expect(editModal(container)).toBeNull();
    expect(rows(container)).toEqual(["Slumpad · avstånd 1", "Slumpad · avstånd 1"]);
    expect(rowModes(container)).toEqual(["Tidspress 17 s", "Tidspress 17 s"]);
    expect(container.querySelector(".itinerary-trips")?.textContent).not.toContain("Nynäshamn");
    expect(focused()).toBe(labelled(container, "Ändra resa 2"));
    const [unchanged, redrawn] = await linkedPairs(container);
    expect(unchanged).toBe(first);
    expect(redrawn).not.toBe(first);
  });

  test("✎ on a picked row opens on Välj själv with its pair, and Spara saves a changed pair", async () => {
    const container = await mountApp("/resplan");
    await pick(container, "Nynäshamn", "Salem", { kind: "unlimited" });
    await click(labelled(container, "Ändra resa 1"));

    expect(editModalTab(container, "Välj själv").getAttribute("aria-selected")).toBe("true");
    expect(inEditModal<HTMLInputElement>(container, 'input[value="unlimited"]').checked).toBe(true);
    expect(inEditModal<HTMLInputElement>(container, "input[id$='-start']").value).toBe("Nynäshamn");
    expect(inEditModal<HTMLInputElement>(container, "input[id$='-destination']").value).toBe(
      "Salem",
    );
    expect(editModalButton(container, "Spara").disabled).toBe(false);

    await type(inEditModal(container, "input[id$='-destination']"), "Trosa");
    await click(inEditModal(container, 'input[value="tie-breaker"]'));
    await click(editModalButton(container, "Spara"));
    expect(rows(container)).toEqual(["Nynäshamn → Trosa"]);
    expect(rowModes(container)).toEqual(["Tidtagning"]);
  });

  test("Spara on Välj själv turns a drawn trip into the picked pair", async () => {
    const container = await mountApp("/resplan");
    await draw(container);
    await click(labelled(container, "Ändra resa 1"));
    await click(editModalTab(container, "Välj själv"));
    expect(editModalButton(container, "Spara").disabled).toBe(true);
    await type(inEditModal(container, "input[id$='-start']"), "Haninge");
    await type(inEditModal(container, "input[id$='-destination']"), "Trosa");
    await click(editModalButton(container, "Spara"));
    expect(rows(container)).toEqual(["Haninge → Trosa"]);
  });

  test("Avbryt and Escape leave the trip as it was", async () => {
    const container = await mountApp("/resplan");
    await pick(container, "Nynäshamn", "Salem");
    await drawTimedInRange(container, 1, 2);
    const before = await linkedPairs(container);
    await click(labelled(container, "Ändra resa 2"));
    await click(editModalTab(container, "Välj själv"));
    await click(inEditModal(container, 'input[value="unlimited"]'));
    await click(editModalButton(container, "Avbryt"));

    expect(editModal(container)).toBeNull();
    expect(rows(container)).toEqual(["Nynäshamn → Salem", "Slumpad · avstånd 1–2"]);
    expect(rowModes(container)).toEqual(["Standard", "Tidspress 17 s"]);
    expect(await linkedPairs(container)).toEqual(before);
    expect(focused()).toBe(labelled(container, "Ändra resa 2"));

    await click(labelled(container, "Ändra resa 1"));
    await act(async () => {
      editModal(container)?.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
        }),
      );
    });
    expect(editModal(container)).toBeNull();
    expect(rows(container)).toEqual(["Nynäshamn → Salem", "Slumpad · avstånd 1–2"]);
  });

  test("editing leaves the mode and range the add modal opens on alone", async () => {
    const container = await mountApp("/resplan");
    await drawTimedInRange(container, 1, 2);
    await click(labelled(container, "Ändra resa 1"));
    await click(inEditModal(container, 'input[value="unlimited"]'));
    await click(editModalButton(container, "Spara"));
    await openAddModal(container);
    expect(modeRadio(container, "timed").checked).toBe(true);
  });
});

const undoToast = (container: HTMLElement) => container.querySelector(".itinerary-undo");

describe("removing a trip", () => {
  test("shows Ångra, which puts the trip back in place with its mode", async () => {
    const container = await mountApp("/resplan");
    await draw(container, 2);
    await pick(container, "Nynäshamn", "Salem", {
      kind: "timed",
      thinkingTime: 23,
    });
    await draw(container, 2);

    await click(labelled(container, "Ta bort resa 3"));
    expect(rows(container)).toHaveLength(4);
    expect(undoToast(container)?.textContent).toBe("Resa 3 borttagenÅngra");
    expect(announced(container)).toBe("Resa 3 borttagen");
    expect(focused()).toBe(labelled(container, "Ta bort resa 3"));

    await click(button(container, "Ångra"));
    expect(rows(container)).toHaveLength(5);
    expect(rows(container)[2]).toBe("Nynäshamn → Salem");
    expect(rowModes(container)[2]).toBe("Tidspress 23 s");
    expect(undoToast(container)).toBeNull();
    expect(focused()).toBe(labelled(container, "Ta bort resa 3"));
  });

  test("only the latest removal can be undone", async () => {
    const container = await mountApp("/resplan");
    await pick(container, "Nynäshamn", "Salem");
    await pick(container, "Haninge", "Trosa");
    await pick(container, "Trosa", "Haninge");
    await click(labelled(container, "Ta bort resa 1"));
    await click(labelled(container, "Ta bort resa 1"));
    expect(undoToast(container)?.textContent).toBe("Resa 1 borttagenÅngra");
    await click(button(container, "Ångra"));
    expect(rows(container)).toEqual(["Haninge → Trosa", "Trosa → Haninge"]);
    expect(undoToast(container)).toBeNull();
  });

  test("the last row's removal focuses the row before, and the only row's the empty list", async () => {
    const container = await mountApp("/resplan");
    await pick(container, "Nynäshamn", "Salem");
    await pick(container, "Haninge", "Trosa");
    await click(labelled(container, "Ta bort resa 2"));
    expect(focused()).toBe(labelled(container, "Ta bort resa 1"));
    await click(labelled(container, "Ta bort resa 1"));
    expect(focused()).toBe(query(container, ".itinerary-empty"));
  });
});

describe("the itinerary's link", () => {
  test("Kopiera länk copies a link with the title, trips, modes, thinking times and version", async () => {
    const container = await mountApp("/resplan");
    await type(query(container, "#itinerary-title"), "Helgresan");
    await pick(container, "Nynäshamn", "Salem", { kind: "tie-breaker" });
    await pick(container, "Trosa", "Haninge", {
      kind: "timed",
      thinkingTime: 17,
    });
    await click(labelled(container, "Dubblera resa 1"));
    expect(query(container, ".itinerary-count").textContent).toBe("3 av 20 resor");

    await click(button(container, "Kopiera länk"));
    expect(copied).toHaveLength(1);
    const url = new URL(copied[0]);
    expect(url.origin).toBe("https://akle.grehn.net");
    expect(url.pathname).toBe("/resplan");
    expect(url.searchParams.get("namn")).toBe("Helgresan");
    expect(decodeLinkPayload(url.searchParams.get("r") ?? "")).toEqual({
      ok: true,
      payload: {
        // "current" is the version today's trip uses, second by start trip after "older".
        versionOrdinal: 1,
        trips: [
          { start: "0192", destination: "0128", mode: { kind: "tie-breaker" } },
          { start: "0192", destination: "0128", mode: { kind: "tie-breaker" } },
          {
            start: "0488",
            destination: "0136",
            mode: { kind: "timed", thinkingTime: 17 },
          },
        ],
      },
    });
    expect(query(container, ".copy-link-toast").textContent).toBe("Kopierat!");
  });

  test("a failed copy shows the link selected in a read-only field, until the next edit", async () => {
    const container = await mountApp("/resplan");
    await pick(container, "Nynäshamn", "Salem");
    await pick(container, "Haninge", "Trosa");
    const clipboard = globalThis.navigator.clipboard;
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("denied")) },
    });
    try {
      await click(button(container, "Kopiera länk"));
    } finally {
      Object.defineProperty(globalThis.navigator, "clipboard", {
        configurable: true,
        value: clipboard,
      });
    }

    const field = query<HTMLInputElement>(container, ".itinerary-copy-fallback input");
    expect(field.readOnly).toBe(true);
    expect(new URL(field.value).origin).toBe("https://akle.grehn.net");
    expect(focused()).toBe(field);
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, field.value.length]);
    expect(query(container, ".itinerary-copy-fallback label").textContent).toBe(
      "Kunde inte kopiera. Kopiera länken själv:",
    );

    await click(button(container, "Kopiera länk"));
    expect(container.querySelector(".itinerary-copy-fallback")).toBeNull();
    expect(query(container, ".copy-link-toast").textContent).toBe("Kopierat!");
  });

  test("the link to copy by hand goes away after an edit", async () => {
    const container = await mountApp("/resplan");
    await pick(container, "Nynäshamn", "Salem");
    await pick(container, "Haninge", "Trosa");
    const clipboard = globalThis.navigator.clipboard;
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    try {
      await click(button(container, "Kopiera länk"));
    } finally {
      Object.defineProperty(globalThis.navigator, "clipboard", {
        configurable: true,
        value: clipboard,
      });
    }
    expect(container.querySelector(".itinerary-copy-fallback")).not.toBeNull();
    await type(query(container, "#itinerary-title"), "Helgresan");
    expect(container.querySelector(".itinerary-copy-fallback")).toBeNull();
  });

  test("Kopiera länk and Spela wait for the second trip", async () => {
    const container = await mountApp("/resplan");
    await pick(container, "Nynäshamn", "Salem");
    expect(button(container, "Kopiera länk").disabled).toBe(true);
    expect(button(container, "Spela").disabled).toBe(true);
    await pick(container, "Nynäshamn", "Salem");
    expect(query(container, ".itinerary-count").textContent).toBe("2 av 20 resor");
    expect(button(container, "Kopiera länk").disabled).toBe(false);
    expect(button(container, "Spela").disabled).toBe(false);
    // Kopiera länk sits left of Spela.
    expect(
      [...container.querySelectorAll(".itinerary-bar button")].map((action) => action.textContent),
    ).toEqual(["Kopiera länk", "Spela"]);
  });

  test("Spela opens the built link in place", async () => {
    const container = await mountApp("/resplan");
    await pick(container, "Nynäshamn", "Salem");
    await pick(container, "Haninge", "Trosa");
    await click(button(container, "Spela"));

    expect(dom.window.location.pathname).toBe("/resplan");
    const r = new URLSearchParams(dom.window.location.search).get("r") ?? "";
    expect(decodeLinkPayload(r).ok).toBe(true);
    expect(container.querySelector("#itinerary-heading")).toBeNull();
  });

  test("the title takes at most 40 characters, with a counter", async () => {
    const container = await mountApp("/resplan");
    const title = query<HTMLInputElement>(container, "#itinerary-title");
    await type(title, "x".repeat(45));
    expect(title.value).toBe("x".repeat(40));
    expect(query(container, ".itinerary-title-count").textContent).toBe("40/40 tecken");
  });

  test("the title counts characters, not UTF-16 units: an emoji is one", async () => {
    const container = await mountApp("/resplan");
    const title = query<HTMLInputElement>(container, "#itinerary-title");
    await type(title, "Tåg🚂");
    expect(query(container, ".itinerary-title-count").textContent).toBe("4/40 tecken");
    await type(title, "🚂".repeat(45));
    expect(title.value).toBe("🚂".repeat(40));
    expect(query(container, ".itinerary-title-count").textContent).toBe("40/40 tecken");
  });

  test("typing into a full title loses nothing and leaves the caret where it was", async () => {
    const container = await mountApp("/resplan");
    const title = query<HTMLInputElement>(container, "#itinerary-title");
    const full = "a".repeat(20) + "b".repeat(20);
    await type(title, full);

    const setValue = Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      "value",
    );
    await act(async () => {
      setValue?.set?.call(title, "a".repeat(20) + "x" + "b".repeat(20));
      title.setSelectionRange(21, 21);
      title.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    expect(title.value).toBe(full);
    expect(title.selectionStart).toBe(20);
  });
});

/** Unmounts the app, as a reload would leave it, keeping what it stored. */
function unmount() {
  if (!mounted) return;
  const { root, container } = mounted;
  act(() => root.unmount());
  container.remove();
  mounted = undefined;
}

/** A title and three trips in a changed order: two picked with modes, one drawn from 1–2. */
async function buildDraft(container: HTMLElement) {
  await type(query(container, "#itinerary-title"), "Helgresan");
  await pick(container, "Nynäshamn", "Salem");
  await pick(container, "Haninge", "Trosa", {
    kind: "timed",
    thinkingTime: 23,
  });
  await openAddModal(container);
  await chooseMode(container, "tie-breaker");
  const [minimum] = inModal(container, ".distance-range").querySelectorAll("input");
  await type(minimum as HTMLInputElement, "1");
  await click(submitButton(container));
  await pressKey(handle(container, 1), "ArrowDown");
}

async function expectDraft(container: HTMLElement) {
  expect(query<HTMLInputElement>(container, "#itinerary-title").value).toBe("Helgresan");
  expect(rows(container)).toEqual([
    "Haninge → Trosa",
    "Nynäshamn → Salem",
    "Slumpad · avstånd 1–2",
  ]);
  expect(rowModes(container)).toEqual(["Tidspress 23 s", "Standard", "Tidtagning"]);
}

describe("the builder's draft", () => {
  test("the title, trips, their order, modes, betänketider and ranges survive a reload", async () => {
    const storage = memoryStorage();
    await buildDraft(await mountApp("/resplan", storage));
    unmount();

    await expectDraft(await mountApp("/resplan", storage));
  });

  test("the draft is still there after Spela and Back", async () => {
    const container = await mountApp("/resplan");
    await buildDraft(container);
    await click(button(container, "Spela"));
    expect(container.querySelector("#itinerary-heading")).toBeNull();

    await act(async () => {
      dom.window.history.replaceState(null, "", "/resplan");
      dom.window.dispatchEvent(new dom.window.PopStateEvent("popstate"));
    });
    await expectDraft(container);
  });

  test("a corrupt stored draft is ignored, and the builder opens empty", async () => {
    const storage = memoryStorage();
    storage.setItem("akle:itinerary-draft", '{"format":2,"versionOrdinal":1,"title":7}');
    const container = await mountApp("/resplan", storage);
    expect(query(container, "#itinerary-heading").textContent).toBe("Bygg en resplan");
    expect(query(container, ".itinerary-count").textContent).toBe("0 av 20 resor · minst 2");
  });

  test("a draft in the old format, without ranges, is ignored", async () => {
    const storage = memoryStorage();
    storage.setItem(
      "akle:itinerary-draft",
      JSON.stringify({
        format: 1,
        versionOrdinal: 1,
        title: "Helgresan",
        trips: [
          {
            trip: {
              start: "0192",
              destination: "0128",
              mode: { kind: "standard" },
            },
            drawn: true,
          },
        ],
      }),
    );
    const container = await mountApp("/resplan", storage);
    expect(query<HTMLInputElement>(container, "#itinerary-title").value).toBe("");
    expect(query(container, ".itinerary-count").textContent).toBe("0 av 20 resor · minst 2");
  });
});

const menuButton = (container: HTMLElement) => labelled(container, "Fler val");
const clearAllItem = (container: HTMLElement) =>
  container.querySelector<HTMLButtonElement>('[role="menuitem"]');
const confirmDialog = (container: HTMLElement) =>
  container.querySelector<HTMLDialogElement>('dialog[aria-label="Ta bort alla resor"]');

async function pressEscape(element: Element | null) {
  await act(async () => {
    element?.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
}

describe("removing all trips from the ⋯ menu", () => {
  test("the Resor header's ⋯ menu holds Ta bort alla resor, which stays out of sight until opened", async () => {
    const container = await mountApp("/resplan");
    expect(menuButton(container).getAttribute("aria-haspopup")).toBe("menu");
    expect(menuButton(container).getAttribute("aria-expanded")).toBe("false");
    expect(clearAllItem(container)).toBeNull();

    await click(menuButton(container));
    expect(menuButton(container).getAttribute("aria-expanded")).toBe("true");
    expect(clearAllItem(container)?.textContent).toBe("Ta bort alla resor");
    expect(clearAllItem(container)?.disabled).toBe(true);
  });

  test("confirming removes every trip and keeps the title, also after a reload", async () => {
    const storage = memoryStorage();
    const container = await mountApp("/resplan", storage);
    await buildDraft(container);
    await click(menuButton(container));
    expect(clearAllItem(container)?.disabled).toBe(false);
    await click(clearAllItem(container) as HTMLButtonElement);

    expect(clearAllItem(container)).toBeNull();
    expect(confirmDialog(container)?.open).toBe(true);
    expect(confirmDialog(container)?.textContent).toContain("Ta bort alla 3 resor?");
    expect(confirmDialog(container)?.textContent).toContain("Namnet ”Helgresan” behålls.");
    expect(rows(container)).toHaveLength(3);

    await click(button(container, "Ta bort alla resor"));
    expect(confirmDialog(container)).toBeNull();
    expect(rows(container)).toEqual([]);
    expect(query<HTMLInputElement>(container, "#itinerary-title").value).toBe("Helgresan");
    expect(query(container, ".itinerary-count").textContent).toBe("0 av 20 resor · minst 2");
    expect(focused()).toBe(query(container, ".itinerary-empty"));
    unmount();

    const reloaded = await mountApp("/resplan", storage);
    expect(query<HTMLInputElement>(reloaded, "#itinerary-title").value).toBe("Helgresan");
    expect(rows(reloaded)).toEqual([]);
  });

  test("cancelling, or Escape, keeps every trip and the title", async () => {
    const container = await mountApp("/resplan");
    await buildDraft(container);

    await click(menuButton(container));
    await click(clearAllItem(container) as HTMLButtonElement);
    await click(button(container, "Avbryt"));
    expect(confirmDialog(container)).toBeNull();
    expect(rows(container)).toHaveLength(3);
    expect(focused()).toBe(menuButton(container));

    await click(menuButton(container));
    await click(clearAllItem(container) as HTMLButtonElement);
    await pressEscape(confirmDialog(container));
    expect(confirmDialog(container)).toBeNull();
    expect(rows(container)).toHaveLength(3);
    expect(query<HTMLInputElement>(container, "#itinerary-title").value).toBe("Helgresan");
  });

  test("the menu opens with focus on its item, Escape closes it back to ⋯, and so does tabbing away", async () => {
    const container = await mountApp("/resplan");
    await pick(container, "Nynäshamn", "Salem");

    await click(menuButton(container));
    expect(focused()).toBe(clearAllItem(container));
    await pressEscape(clearAllItem(container));
    expect(clearAllItem(container)).toBeNull();
    expect(focused()).toBe(menuButton(container));

    await click(menuButton(container));
    await act(async () => {
      query<HTMLInputElement>(container, "#itinerary-title").focus();
    });
    expect(clearAllItem(container)).toBeNull();
  });

  test("a click elsewhere closes the menu", async () => {
    const container = await mountApp("/resplan");
    await click(menuButton(container));
    await act(async () => {
      dom.window.document.body.dispatchEvent(
        new dom.window.MouseEvent("pointerdown", { bubbles: true }),
      );
    });
    expect(clearAllItem(container)).toBeNull();
  });
});
