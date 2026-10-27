import type { ReactNode } from "react";
import "./ButtonGroup.css";

/**
 * A screen's closing actions stacked one above another, equal in width and centred, with the
 * primary action first. Its children are buttons, or links that look like buttons.
 */
export function ButtonGroup({
  as: Element = "div",
  label,
  children,
}: {
  /** "nav" when the actions lead elsewhere, as a landmark named by the label. */
  as?: "div" | "nav";
  label?: string;
  children: ReactNode;
}) {
  return (
    <Element className="button-group" aria-label={label}>
      {children}
    </Element>
  );
}
