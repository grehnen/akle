import type { MouseEvent, ReactNode } from "react";
import { useNavigation } from "./navigation";

/**
 * A link to another page of the app that stays in the app, through the History API, so Back
 * returns. `state` is the page state the page opens on, followed in the app only. A click that
 * asks for a new tab or window is left to the browser.
 */
export function AppLink({
  href,
  state,
  children,
  ...attributes
}: {
  href: string;
  state?: unknown;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
  "aria-current"?: "page";
  title?: string;
}) {
  const { navigate } = useNavigation();
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    navigate(href, state);
  };
  return (
    <a href={href} onClick={onClick} {...attributes}>
      {children}
    </a>
  );
}
