import { type RefObject, useLayoutEffect, useRef } from "react";

/**
 * Keeps an element where it is on screen across the next render, as rows go in above it: `keep`
 * notes where the element is now, and after the render the page scrolls so it's back there. A page
 * too short to scroll that far grows the `scrollRoom` element at its end by what's missing; that
 * room goes again on a render while `shrink` holds.
 */
export function useKeepOnScreen(shrink: boolean): {
  keep: (element: HTMLElement) => void;
  scrollRoom: RefObject<HTMLDivElement | null>;
} {
  const kept = useRef<{ element: HTMLElement; top: number }>(undefined);
  const scrollRoom = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const keeping = kept.current;
    kept.current = undefined;
    if (shrink && scrollRoom.current !== null) scrollRoom.current.style.height = "";
    if (keeping !== undefined) keepOnScreen(keeping, scrollRoom.current);
  });
  const keep = (element: HTMLElement) => {
    kept.current = { element, top: element.getBoundingClientRect().top };
  };
  return { keep, scrollRoom };
}

/**
 * Scrolls so `kept.element` is back where it was on screen, `top` from the viewport. A page too
 * short to scroll that far first grows `room` at its end by what's missing.
 */
function keepOnScreen(kept: { element: HTMLElement; top: number }, room: HTMLElement | null) {
  const moved = kept.element.getBoundingClientRect().top - kept.top;
  if (moved === 0) return;
  const target = window.scrollY + moved;
  const scrollEnd = document.documentElement.scrollHeight - window.innerHeight;
  if (room !== null && target > scrollEnd) {
    room.style.height = `${room.offsetHeight + target - scrollEnd}px`;
  }
  window.scrollTo(0, target);
}
