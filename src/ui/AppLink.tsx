import type { MouseEvent, ReactNode } from "react";

/**
 * A link to another page of the app that stays in the app, through the History API, so Back
 * returns. A click that asks for a new tab or window is left to the browser.
 */
export function AppLink({
  href,
  onNavigate,
  children,
  ...attributes
}: {
  href: string;
  onNavigate: (to: string) => void;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
  "aria-current"?: "page";
  title?: string;
}) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    onNavigate(href);
  };
  return (
    <a href={href} onClick={onClick} {...attributes}>
      {children}
    </a>
  );
}
