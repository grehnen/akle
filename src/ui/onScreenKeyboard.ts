import { useEffect, useState } from "react";

/** One reading of the window and its visual viewport. */
export type ViewportSample = {
  width: number;
  /** `window.innerHeight`: shrinks for the keyboard only with `interactive-widget=resizes-content`. */
  layoutHeight: number;
  /** `visualViewport.height`: shrinks for the keyboard on both iOS and Android. */
  visibleHeight: number;
  visibleTop: number;
  scale: number;
  textFieldFocused: boolean;
};

export type KeyboardState = {
  open: boolean;
  /** How much of the layout viewport's bottom the keyboard covers (iOS); 0 when the page resizes. */
  inset: number;
  visibleHeight: number;
  /** The tallest visible height seen at this width: the height with no keyboard. */
  baseline: { width: number; height: number };
};

/** A keyboard takes far more height than a browser toolbar showing or hiding. */
const MIN_KEYBOARD_HEIGHT = 150;

export function nextKeyboardState(
  previous: KeyboardState | undefined,
  sample: ViewportSample,
): KeyboardState {
  // Pinch zoom shrinks the visual viewport too, so compare heights in unzoomed pixels.
  const unzoomedHeight = sample.visibleHeight * sample.scale;
  const sameOrientation = previous?.baseline.width === sample.width;
  const baseline = {
    width: sample.width,
    height: sameOrientation ? Math.max(previous.baseline.height, unzoomedHeight) : unzoomedHeight,
  };
  const open = sample.textFieldFocused && baseline.height - unzoomedHeight >= MIN_KEYBOARD_HEIGHT;
  const inset = open
    ? Math.max(0, Math.round(sample.layoutHeight - sample.visibleHeight - sample.visibleTop))
    : 0;
  return { open, inset, visibleHeight: sample.visibleHeight, baseline };
}

function isTextField(element: Element | null): boolean {
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLInputElement) {
    return !["button", "checkbox", "radio", "range", "submit", "reset", "file", "color"].includes(
      element.type,
    );
  }
  return element instanceof HTMLElement && element.isContentEditable;
}

/**
 * Tracks the on-screen keyboard and exposes it to CSS on `<html>`: `data-keyboard="open"`,
 * `--keyboard-inset` (to pin content above the keyboard) and `--visible-height`.
 */
export function useOnScreenKeyboard(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    let state: KeyboardState | undefined;

    const update = () => {
      state = nextKeyboardState(state, {
        width: window.innerWidth,
        layoutHeight: window.innerHeight,
        visibleHeight: viewport.height,
        visibleTop: viewport.offsetTop,
        scale: viewport.scale,
        textFieldFocused: isTextField(document.activeElement),
      });
      root.style.setProperty("--keyboard-inset", `${state.inset}px`);
      root.style.setProperty("--visible-height", `${state.visibleHeight}px`);
      if (state.open) root.dataset.keyboard = "open";
      else delete root.dataset.keyboard;
      setOpen(state.open);
    };

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      root.style.removeProperty("--keyboard-inset");
      root.style.removeProperty("--visible-height");
      delete root.dataset.keyboard;
    };
  }, []);

  return open;
}
