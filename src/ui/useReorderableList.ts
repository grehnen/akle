import {
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/** What happened to a keyboard-lifted item, for announcing, with its position (from 1) of `count`. */
export type ReorderAnnouncement = {
  kind: "lifted" | "moved" | "dropped" | "cancelled";
  position: number;
  count: number;
};

type ReorderableListOptions = {
  /** The list's items in their current order; their elements are the list element's children. */
  ids: readonly number[];
  /** Moves the item at one position to another. */
  onMove: (from: number, to: number) => void;
  /** Told the item's new position (from 0) once a keyboard drop or a drag has changed it. */
  onMoved: (id: number, position: number) => void;
  /** Told each step of a keyboard lift; a drop that changed the order is told to `onMoved` instead. */
  onAnnounce: (announcement: ReorderAnnouncement) => void;
};

/** What a drag handle takes: its pointer press, its keys and its focus leaving. */
export type ReorderHandleProps = {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  onBlur: () => void;
  "aria-pressed": boolean;
};

/** Where a row lay, and how tall it was, when a drag started. */
type RowBox = { top: number; height: number };

/** The item a keyboard lift holds, and the position it was lifted from. */
type Lift = { id: number; from: number };

/**
 * Reordering of a list by dragging a handle with the pointer (mouse or touch), or with the
 * keyboard: Space on a handle lifts its item, ArrowUp and ArrowDown move it, Space drops it and
 * Escape (or the focus leaving the handle) puts it back where it was lifted from. The dragged
 * item follows the pointer and the other rows move aside as it passes them. Spread
 * `handleProps(id)` on each item's handle, which should have `touch-action: none`, offset the
 * dragged item's element by `dragged.offset` pixels and mark the `lifted` one.
 */
export function useReorderableList(
  list: RefObject<HTMLElement | null>,
  { ids, onMove, onMoved, onAnnounce }: ReorderableListOptions,
) {
  const [dragged, setDragged] = useState<{ id: number; offset: number }>();
  const [lifted, setLifted] = useState<Lift>();
  // The latest order, which a drag in progress reads between renders.
  const order = useRef(ids);
  const latest = useRef({ onMove, onMoved, onAnnounce });
  // A lifted item's handle, to focus again once its move has rendered: moving the row may lose it.
  const refocus = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    order.current = ids;
    latest.current = { onMove, onMoved, onAnnounce };
    if (refocus.current === null) return;
    if (document.activeElement !== refocus.current) refocus.current.focus();
    refocus.current = null;
  });

  const startDrag = (event: PointerEvent<HTMLElement>, id: number) => {
    if (event.button !== 0 || !list.current || lifted !== undefined) return;
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

  /** Moves the lifted item to `target` in the order the next render will show. */
  const moveLifted = (id: number, target: number) => {
    const position = order.current.indexOf(id);
    latest.current.onMove(position, target);
    const others = order.current.filter((other) => other !== id);
    order.current = [...others.slice(0, target), id, ...others.slice(target)];
  };

  const dropLifted = ({ id, from }: Lift) => {
    setLifted(undefined);
    const position = order.current.indexOf(id);
    if (position !== from) {
      latest.current.onMoved(id, position);
    } else {
      latest.current.onAnnounce({ kind: "dropped", position: position + 1, count: ids.length });
    }
  };

  const cancelLift = ({ id, from }: Lift, handle?: HTMLElement) => {
    setLifted(undefined);
    if (order.current.indexOf(id) !== from) moveLifted(id, from);
    if (handle) refocus.current = handle;
    latest.current.onAnnounce({ kind: "cancelled", position: from + 1, count: ids.length });
  };

  const keyOnHandle = (event: KeyboardEvent<HTMLElement>, id: number) => {
    const handle = event.currentTarget;
    const holding = lifted?.id === id ? lifted : undefined;
    if (event.key === " ") {
      event.preventDefault();
      if (event.repeat) return;
      if (holding) {
        dropLifted(holding);
        return;
      }
      const from = order.current.indexOf(id);
      setLifted({ id, from });
      latest.current.onAnnounce({ kind: "lifted", position: from + 1, count: ids.length });
      return;
    }
    if (!holding) return;
    if (event.key === "Escape") {
      event.preventDefault();
      cancelLift(holding, handle);
      return;
    }
    const by = { ArrowUp: -1, ArrowDown: 1 }[event.key];
    if (by === undefined) return;
    event.preventDefault();
    const target = order.current.indexOf(id) + by;
    if (target < 0 || target >= order.current.length) return;
    moveLifted(id, target);
    refocus.current = handle;
    latest.current.onAnnounce({ kind: "moved", position: target + 1, count: ids.length });
  };

  const blurHandle = (id: number) => {
    // Moving a row can blur its handle for a moment; the focus then comes back to it.
    if (lifted?.id !== id || refocus.current !== null) return;
    cancelLift(lifted);
  };

  const handleProps = (id: number): ReorderHandleProps => ({
    onPointerDown: (event) => startDrag(event, id),
    onKeyDown: (event) => keyOnHandle(event, id),
    onBlur: () => blurHandle(id),
    "aria-pressed": lifted?.id === id,
  });

  return { dragged, lifted: lifted?.id, handleProps };
}
