import { type RefObject, useEffect } from "react";

/** Calls `close` when a press lands outside `root`, for as long as `open`. */
export function useCloseOnOutsidePress(
  root: RefObject<HTMLElement | null>,
  open: boolean,
  close: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [root, open, close]);
}
