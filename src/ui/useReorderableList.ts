import {
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

type ReorderableListOptions = {
  /** The list's items in their current order; their elements are the list element's children. */
  ids: readonly number[];
  /** Moves the item at one position to another. */
  onMove: (from: number, to: number) => void;
  /** Told the item's new position (from 0) once a keyboard move or a drag has changed it. */
  onMoved: (id: number, position: number) => void;
};

/** What a drag handle takes: its pointer press and its keys. */
export type ReorderHandleProps = {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onKeyDown: (event: KeyboardEvent) => void;
};

/** Where a row lay, and how tall it was, when a drag started. */
type RowBox = { top: number; height: number };

/**
 * Reordering of a list by dragging a handle with the pointer (mouse or touch), or by pressing
 * ArrowUp and ArrowDown on the focused handle. The dragged item follows the pointer and the other
 * rows move aside as it passes them. Spread `handleProps(id)` on each item's handle, which should
 * have `touch-action: none`, and offset the dragged item's element by `dragged.offset` pixels.
 */
export function useReorderableList(
  list: RefObject<HTMLElement | null>,
  { ids, onMove, onMoved }: ReorderableListOptions,
) {
  const [dragged, setDragged] = useState<{ id: number; offset: number }>();
  // The latest order, which a drag in progress reads between renders.
  const order = useRef(ids);
  const latest = useRef({ onMove, onMoved });
  useLayoutEffect(() => {
    order.current = ids;
    latest.current = { onMove, onMoved };
  });

  const startDrag = (event: PointerEvent<HTMLElement>, id: number) => {
    if (event.button !== 0 || !list.current) return;
    event.preventDefault();
    event.currentTarget.focus();

    const boxes = new Map<number, RowBox>(
      [...list.current.children].map((row, index) => {
        const { top, height } = row.getBoundingClientRect();
        return [order.current[index], { top, height }];
      }),
    );
    const startPosition = order.current.indexOf(id);
    const listTop = boxes.get(order.current[0])?.top ?? 0;
    const grabbed = boxes.get(id) ?? { top: 0, height: 0 };
    const grabOffset = event.clientY - grabbed.top;
    setDragged({ id, offset: 0 });

    const move = ({ clientY }: MouseEvent) => {
      // The row drops among the others, packed as they lie without it, by its centre.
      const others = order.current.filter((other) => other !== id);
      const center = clientY - grabOffset + grabbed.height / 2;
      let slotTop = listTop;
      let target = 0;
      for (const other of others) {
        const height = boxes.get(other)?.height ?? 0;
        if (slotTop + height / 2 >= center) break;
        slotTop += height;
        target += 1;
      }
      const position = order.current.indexOf(id);
      if (target !== position) {
        latest.current.onMove(position, target);
        order.current = [...others.slice(0, target), id, ...others.slice(target)];
      }
      setDragged({ id, offset: clientY - grabOffset - slotTop });
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      setDragged(undefined);
      const position = order.current.indexOf(id);
      if (position !== startPosition) latest.current.onMoved(id, position);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  const moveWithKey = (event: KeyboardEvent, id: number) => {
    const by = { ArrowUp: -1, ArrowDown: 1 }[event.key];
    if (by === undefined) return;
    event.preventDefault();
    const position = order.current.indexOf(id);
    const target = position + by;
    if (target < 0 || target >= order.current.length) return;
    latest.current.onMove(position, target);
    latest.current.onMoved(id, target);
  };

  const handleProps = (id: number): ReorderHandleProps => ({
    onPointerDown: (event: PointerEvent<HTMLElement>) => startDrag(event, id),
    onKeyDown: (event: KeyboardEvent) => moveWithKey(event, id),
  });

  return { dragged, handleProps };
}
