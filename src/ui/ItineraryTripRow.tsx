import type { DraftTrip } from "../freePlay/builderDraft";
import { type GraphVersion, kommunName } from "../graph/graphVersion";
import { distanceRangeText, modeName } from "./messages";
import { ModeMark } from "./ModeMark";
import type { ReorderHandleProps } from "./useReorderableList";

/** A trip in the itinerary being built, with a key for its row and the range it was drawn from. */
export type BuilderTrip = DraftTrip & { id: number };

/** A row of the trip list: its pair, or a drawn trip's range, over its mode, then its actions. */
export function TripRow({
  graph,
  entry,
  number,
  full,
  dragOffset,
  lifted,
  handleProps,
  onEdit,
  onDuplicate,
  onRemove,
}: {
  graph: GraphVersion;
  entry: BuilderTrip;
  number: number;
  full: boolean;
  /** How far the pointer has pulled the row from its place, while it is being dragged. */
  dragOffset?: number;
  /** Whether the keyboard holds the row, to move with the arrow keys. */
  lifted: boolean;
  handleProps: ReorderHandleProps;
  onEdit: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const { trip, drawnFrom } = entry;
  const start = kommunName(graph, trip.start);
  const destination = kommunName(graph, trip.destination);
  return (
    <li
      data-mode={trip.mode.kind}
      className={[
        "itinerary-trip",
        dragOffset !== undefined && "itinerary-trip--dragged",
        lifted && "itinerary-trip--lifted",
      ]
        .filter(Boolean)
        .join(" ")}
      style={dragOffset === undefined ? undefined : { transform: `translateY(${dragOffset}px)` }}
    >
      <button
        type="button"
        className="itinerary-trip-handle"
        data-trip-handle={entry.id}
        aria-label={`Flytta resa ${number}`}
        {...handleProps}
      >
        <span aria-hidden="true">⠿</span>
      </button>
      <span className="itinerary-trip-number" aria-hidden="true">
        {number}
      </span>
      <span className="itinerary-trip-what">
        {/* A drawn trip's pair stays a surprise, even to its builder. */}
        <span className="itinerary-trip-pair">
          {drawnFrom ? (
            <>
              Slumpad · <span className="itinerary-trip-range">{distanceRangeText(drawnFrom)}</span>
            </>
          ) : (
            <>
              <span className="itinerary-start">{start}</span>
              {" → "}
              <span className="itinerary-destination">{destination}</span>
            </>
          )}
        </span>
        <span className="itinerary-trip-mode">
          <ModeMark kind={trip.mode.kind}>{modeName(trip.mode)}</ModeMark>
        </span>
      </span>
      <span className="itinerary-trip-actions">
        <button
          type="button"
          aria-label={`Ändra resa ${number}`}
          // Found by its number for focus, never by its words.
          data-edit-trip={number}
          onClick={onEdit}
        >
          <span aria-hidden="true">✎</span>
        </button>
        <button
          type="button"
          aria-label={`Dubblera resa ${number}`}
          disabled={full}
          onClick={onDuplicate}
        >
          <span aria-hidden="true">⧉</span>
        </button>
        <button
          type="button"
          aria-label={`Ta bort resa ${number}`}
          // Found by its number for focus, never by its words.
          data-remove-trip={number}
          onClick={onRemove}
        >
          <span aria-hidden="true">✕</span>
        </button>
      </span>
    </li>
  );
}
