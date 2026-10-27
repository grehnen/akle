import { type KeyboardEvent, useRef, useState } from "react";
import { useCloseOnOutsidePress } from "./useCloseOnOutsidePress";
import "./OverflowMenu.css";

type OverflowMenuProps = {
  /** The ⋯ button's accessible name. */
  label: string;
  /** The menu's only item. */
  itemLabel: string;
  itemDisabled?: boolean;
  onSelect: () => void;
};

/**
 * A ⋯ button that opens a small menu of one item. The item takes focus on opening; Escape closes
 * the menu back to the button, and a click or focus outside it closes it where it is.
 */
export function OverflowMenu({ label, itemLabel, itemDisabled, onSelect }: OverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useCloseOnOutsidePress(root, open, () => setOpen(false));

  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    setOpen(false);
    toggle.current?.focus();
  };

  return (
    <div
      ref={root}
      className="overflow-menu"
      onBlur={(event) => {
        if (!root.current?.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={toggle}
        type="button"
        className="overflow-menu-button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onKeyDown={closeOnEscape}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open && (
        <div className="overflow-menu-list" role="menu">
          <button
            type="button"
            role="menuitem"
            autoFocus
            disabled={itemDisabled}
            onClick={() => {
              setOpen(false);
              onSelect();
            }}
            onKeyDown={closeOnEscape}
          >
            {itemLabel}
          </button>
        </div>
      )}
    </div>
  );
}
