import { describe, expect, test } from "bun:test";
import { nextKeyboardState, type ViewportSample } from "./onScreenKeyboard";

const phone: ViewportSample = {
  width: 390,
  layoutHeight: 800,
  visibleHeight: 800,
  visibleTop: 0,
  scale: 1,
  textFieldFocused: false,
};

function after(...samples: Partial<ViewportSample>[]) {
  return samples.reduce(
    (state, sample) => nextKeyboardState(state, { ...phone, ...sample }),
    nextKeyboardState(undefined, phone),
  );
}

describe("nextKeyboardState", () => {
  test("is closed while the input is focused but nothing covers the page, as on desktop", () => {
    expect(after({ textFieldFocused: true })).toMatchObject({ open: false, inset: 0 });
  });

  test("on iOS, the keyboard covers the bottom of the layout viewport", () => {
    expect(after({ textFieldFocused: true, visibleHeight: 460 })).toEqual({
      open: true,
      inset: 340,
      visibleHeight: 460,
      baseline: { width: 390, height: 800 },
    });
  });

  test("on iOS, the inset leaves out how far the visible area is scrolled down", () => {
    expect(after({ textFieldFocused: true, visibleHeight: 460, visibleTop: 100 })).toMatchObject({
      open: true,
      inset: 240,
    });
  });

  test("on Android with resizes-content, the whole page shrinks and nothing is covered", () => {
    expect(after({ textFieldFocused: true, layoutHeight: 460, visibleHeight: 460 })).toMatchObject({
      open: true,
      inset: 0,
      visibleHeight: 460,
    });
  });

  test("a toolbar showing or hiding isn't the keyboard", () => {
    expect(after({ textFieldFocused: true, visibleHeight: 720 })).toMatchObject({ open: false });
  });

  test("there is no keyboard without a focused text field", () => {
    expect(after({ visibleHeight: 460 })).toMatchObject({ open: false });
  });

  test("zooming in isn't the keyboard", () => {
    expect(after({ textFieldFocused: true, visibleHeight: 400, scale: 2 })).toMatchObject({
      open: false,
    });
  });

  test("turning the phone measures the new orientation afresh", () => {
    const landscape = { width: 800, layoutHeight: 360, visibleHeight: 360 };
    expect(after(landscape, { ...landscape, textFieldFocused: true })).toMatchObject({
      open: false,
      baseline: { width: 800, height: 360 },
    });
    expect(
      after(landscape, { ...landscape, textFieldFocused: true, visibleHeight: 160 }),
    ).toMatchObject({ open: true, inset: 200 });
  });
});
