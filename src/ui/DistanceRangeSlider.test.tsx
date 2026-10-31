import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import type { Root } from "react-dom/client";
import type { DistanceRange } from "../freePlay/draw";
import { DistanceRangeSlider } from "./DistanceRangeSlider";

const dom = new JSDOM('<!doctype html><html lang="sv"><body></body></html>');
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

let mounted: { root: Root; container: HTMLElement } | undefined;
afterEach(async () => {
  if (!mounted) return;
  const { root, container } = mounted;
  await act(async () => root.unmount());
  container.remove();
  mounted = undefined;
});

/** The slider from 1 to 12, starting at `initial`; `setRange` changes the range from outside. */
async function mountSlider(initial: DistanceRange) {
  const container = dom.window.document.createElement("div");
  dom.window.document.body.append(container);
  const root = createRoot(container);
  mounted = { root, container };
  const showRange = (range: DistanceRange) =>
    root.render(<DistanceRangeSlider range={range} largest={12} onChange={showRange} />);
  await act(async () => showRange(initial));
  const [first, second] = container.querySelectorAll("input");
  return {
    first: first as HTMLInputElement,
    second: second as HTMLInputElement,
    label: () => container.querySelector(".free-play-range-label")?.textContent,
    setRange: (range: DistanceRange) => act(async () => showRange(range)),
  };
}

/** Moves a thumb to `value`, as one step of dragging it does: its own input takes the value. */
async function moveThumb(thumb: HTMLInputElement, value: number) {
  const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value");
  await act(async () => {
    setValue?.set?.call(thumb, String(value));
    thumb.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}

describe("Thumbs on the same value", () => {
  test("the top thumb can be lowered", async () => {
    const { second, label } = await mountSlider({ min: 5, max: 5 });

    await moveThumb(second, 4);

    expect(label()).toBe("Avstånd 4–5");
    expect(second.value).toBe("4");
  });

  test("the top thumb can be raised", async () => {
    const { second, label } = await mountSlider({ min: 5, max: 5 });

    await moveThumb(second, 6);

    expect(label()).toBe("Avstånd 5–6");
    expect(second.value).toBe("6");
  });

  test("the top thumb can be lowered from the very top of the track", async () => {
    const { second, label } = await mountSlider({ min: 12, max: 12 });

    await moveThumb(second, 11);

    expect(label()).toBe("Avstånd 11–12");
  });

  test("the top thumb can be raised from the very bottom of the track", async () => {
    const { second, label } = await mountSlider({ min: 1, max: 1 });

    await moveThumb(second, 2);

    expect(label()).toBe("Avstånd 1–2");
  });
});

describe("Dragging one thumb past the other", () => {
  test("the dragged thumb keeps following the drag, and becomes the other end of the range", async () => {
    const { first, second, label } = await mountSlider({ min: 3, max: 8 });

    await moveThumb(first, 9);
    expect(label()).toBe("Avstånd 8–9");
    expect(first.value).toBe("9");
    expect(second.value).toBe("8");

    await moveThumb(first, 11);
    expect(label()).toBe("Avstånd 8–11");
    expect(first.value).toBe("11");
    expect(second.value).toBe("8");
  });

  test("works from the upper thumb too, downwards", async () => {
    const { first, second, label } = await mountSlider({ min: 3, max: 8 });

    await moveThumb(second, 2);

    expect(label()).toBe("Avstånd 2–3");
    expect(first.value).toBe("3");
    expect(second.value).toBe("2");
  });

  test("crossing back restores the thumbs' original ends", async () => {
    const { first, second, label } = await mountSlider({ min: 3, max: 8 });

    await moveThumb(first, 10);
    await moveThumb(first, 4);

    expect(label()).toBe("Avstånd 4–8");
    expect(first.value).toBe("4");
    expect(second.value).toBe("8");
  });

  test("resting on the other thumb midway through a drag doesn't end the crossing", async () => {
    const { first, second, label } = await mountSlider({ min: 3, max: 8 });

    await moveThumb(first, 8);
    expect(label()).toBe("Avstånd 8");
    await moveThumb(first, 9);

    expect(label()).toBe("Avstånd 8–9");
    expect(first.value).toBe("9");
    expect(second.value).toBe("8");
  });

  test("each thumb is named for the end of the range it holds", async () => {
    const { first, second } = await mountSlider({ min: 3, max: 8 });
    expect(first.getAttribute("aria-label")).toBe("Minsta avstånd");
    expect(second.getAttribute("aria-label")).toBe("Största avstånd");

    await moveThumb(first, 9);

    expect(first.getAttribute("aria-label")).toBe("Största avstånd");
    expect(second.getAttribute("aria-label")).toBe("Minsta avstånd");
  });

  test("the fill spans the range whichever thumb holds which end", async () => {
    const { first } = await mountSlider({ min: 1, max: 1 });

    await moveThumb(first, 12);

    const fill = mounted?.container.querySelector<HTMLElement>(".distance-range-fill");
    expect(fill?.style.left).toBe("0%");
    expect(fill?.style.right).toBe("0%");
  });
});

test("a range changed from outside after a crossing still shows on the thumbs", async () => {
  const { first, second, label, setRange } = await mountSlider({ min: 3, max: 8 });
  await moveThumb(first, 9);

  await setRange({ min: 2, max: 6 });

  expect(label()).toBe("Avstånd 2–6");
  expect([first.value, second.value].map(Number).sort((a, b) => a - b)).toEqual([2, 6]);
});
