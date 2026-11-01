import { type RefObject, useEffect, useRef } from "react";
import { REDUCED_MOTION_QUERY } from "./FinishEffect";

type BoardKeyboardScroll = {
  keyboardOpen: boolean;
  guessCount: number;
  map: RefObject<HTMLElement | null>;
  signs: RefObject<HTMLElement | null>;
};

/**
 * Moves the page for the on-screen keyboard: its opening and each guess made with it open bring
 * the map to the top, above the pinned guess input, and its closing brings the signs back.
 * Typing alone moves nothing, so a player who scrolled up can read the signs while typing.
 */
export function useBoardKeyboardScroll({
  keyboardOpen,
  guessCount,
  map,
  signs,
}: BoardKeyboardScroll): void {
  const previous = useRef({ keyboardOpen, guessCount });

  useEffect(() => {
    const before = previous.current;
    previous.current = { keyboardOpen, guessCount };
    const target = keyboardOpen
      ? !before.keyboardOpen || guessCount !== before.guessCount
        ? map
        : undefined
      : before.keyboardOpen
        ? signs
        : undefined;
    // jsdom has no scrollIntoView.
    target?.current?.scrollIntoView?.({
      block: "start",
      behavior: window.matchMedia(REDUCED_MOTION_QUERY).matches ? "auto" : "smooth",
    });
  }, [keyboardOpen, guessCount, map, signs]);
}
