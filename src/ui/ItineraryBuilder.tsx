import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Trip } from "../engine/game";
import type { BuilderDraft, DraftTrip } from "../freePlay/builderDraft";
import {
  defaultDistanceRange,
  type DistanceRange,
  drawTrip,
  drawTrips,
  largestDistance,
  type RandomSource,
  tripPairs,
} from "../freePlay/draw";
import {
  editTitle,
  ITINERARY_TRIPS,
  itineraryLinkPath,
  MAX_ITINERARY_TITLE,
  titleLength,
} from "../freePlay/itineraryLink";
import { DEFAULT_THINKING_TIME } from "../freePlay/modeRules";
import { chosenMode, setupChoiceOfTrip, type SetupChoice } from "../freePlay/setupChoice";
import { type GraphVersion, kommunName } from "../graph/graphVersion";
import { SITE_URL } from "../siteUrl";
import { CopyLinkButton } from "./CopyLinkButton";
import { modeName } from "./messages";
import { Modal } from "./Modal";
import { OverflowMenu } from "./OverflowMenu";
import { TripModal, type TripModalResult } from "./TripModal";
import { UndoToast, useUndoRemoval } from "./UndoToast";
import { useAnnouncer } from "./useAnnouncer";
import { type ReorderHandleProps, useReorderableList } from "./useReorderableList";
import "./ItineraryBuilder.css";

type ItineraryBuilderProps = {
  graph: GraphVersion;
  /** The current version's ordinal, which the itinerary's link pins all its trips to. */
  ordinal: number;
  /** Opens the built itinerary's link in place. */
  onPlay: (link: string) => void;
  /** What drawn trips are drawn with; `Math.random` by default. */
  random?: RandomSource;
  /** Shown under the heading: the way back to an unfinished itinerary, when there is one. */
  banner?: ReactNode;
  /** The draft the builder opens with, empty by default. */
  initialDraft?: BuilderDraft;
  /** Told the draft whenever it changes, from the start. */
  onDraftChange?: (draft: BuilderDraft) => void;
};

/** A trip in the itinerary being built, with a key for its row and the range it was drawn from. */
type BuilderTrip = DraftTrip & { id: number };

const ADD_BUTTON = ".itinerary-add-trips";
const COUNT = ".itinerary-count";
const MENU_BUTTON = ".overflow-menu-button";
const EMPTY_LIST = ".itinerary-empty";

/**
 * The itinerary builder (Bygg en resplan): a title, the ordered trip list under its "Resor"
 * header, whose "+ Lägg till" opens a modal that adds drawn or hand-picked trips, and a bar that
 * copies or starts the itinerary's link. It can only make valid itineraries: playable trips, at
 * most 20 of them and a title of at most 40 characters; the link waits for the second trip.
 */
export function ItineraryBuilder({
  graph,
  ordinal,
  onPlay,
  random = Math.random,
  banner,
  initialDraft,
  onDraftChange,
}: ItineraryBuilderProps) {
  const pairs = useMemo(() => tripPairs(graph), [graph]);
  const largest = largestDistance(pairs);
  const [title, setTitle] = useState(initialDraft?.title ?? "");
  // A restored draft's rows are numbered from 1, and new rows after them.
  const [trips, setTrips] = useState<readonly BuilderTrip[]>(() =>
    (initialDraft?.trips ?? []).map((trip, index) => ({
      ...trip,
      id: index + 1,
    })),
  );
  const nextId = useRef((initialDraft?.trips.length ?? 0) + 1);
  const withIds = (added: readonly DraftTrip[]) =>
    added.map((trip) => ({ ...trip, id: nextId.current++ }));
  useEffect(
    () =>
      onDraftChange?.({
        title,
        trips: trips.map(({ trip, drawnFrom }) => ({ trip, drawnFrom })),
      }),
    [title, trips, onDraftChange],
  );
  const room = ITINERARY_TRIPS.max - trips.length;
  const link =
    trips.length >= ITINERARY_TRIPS.min
      ? itineraryLinkPath(
          ordinal,
          title,
          trips.map(({ trip }) => trip),
        )
      : undefined;

  const [adding, setAdding] = useState(false);
  // The row being edited in the modal, by its place in the list.
  const [editingIndex, setEditingIndex] = useState<number>();
  // What the add modal opens on: the mode and range last added or saved with, kept for this visit only.
  const [lastUsed, setLastUsed] = useState<SetupChoice>(() => ({
    mode: "standard",
    thinkingTime: DEFAULT_THINKING_TIME,
    range: defaultDistanceRange(largest),
  }));

  // What the next render focuses, by a selector within the builder.
  const section = useRef<HTMLElement>(null);
  const focusAfterRender = useRef<string>(undefined);
  useLayoutEffect(() => {
    const selector = focusAfterRender.current;
    focusAfterRender.current = undefined;
    if (selector !== undefined) section.current?.querySelector<HTMLElement>(selector)?.focus();
  });
  const removeButton = (number: number) => `[data-remove-trip="${number}"]`;
  const handleOf = (id: number) => `[data-trip-handle="${id}"]`;
  const editButton = (number: number) => `[data-edit-trip="${number}"]`;

  const { announcement, announce } = useAnnouncer();
  // The latest removal, until Ångra, its time running out, or another trip added.
  const { removed, showRemoval, hold } = useUndoRemoval<{
    entry: BuilderTrip;
    index: number;
  }>();

  const closeModal = () => {
    setAdding(false);
    focusAfterRender.current = ADD_BUTTON;
  };
  const closeEditModal = () => {
    if (editingIndex !== undefined) focusAfterRender.current = editButton(editingIndex + 1);
    setEditingIndex(undefined);
  };
  const add = (result: TripModalResult) => {
    const { choice } = result;
    const trip = ({ start, destination }: Trip) => ({
      start,
      destination,
      mode: chosenMode(choice),
    });
    const added: DraftTrip[] =
      result.tab === "pick"
        ? [{ trip: trip(result.trip) }]
        : drawTrips(
            pairs,
            choice.range,
            Math.min(result.count, room),
            random,
            trips.at(-1)?.trip,
          ).map((pair) => ({ trip: trip(pair), drawnFrom: choice.range }));
    setLastUsed(choice);
    closeModal();
    if (added.length === 0) return;
    setTrips((current) => [...current, ...withIds(added)].slice(0, ITINERARY_TRIPS.max));
    showRemoval(undefined);
    announce(
      added.length === 1 ? `Resa ${trips.length + 1} tillagd` : `${added.length} resor tillagda`,
    );
    if (added.length >= room) focusAfterRender.current = COUNT;
  };
  const list = useRef<HTMLOListElement>(null);
  const { dragged, handleProps } = useReorderableList(list, {
    ids: trips.map(({ id }) => id),
    onMove: (from, to) =>
      setTrips((current) => {
        const next = [...current];
        next.splice(to, 0, ...next.splice(from, 1));
        return next;
      }),
    onMoved: (id, position) => {
      announce(`Resa flyttad till plats ${position + 1} av ${trips.length}`);
      focusAfterRender.current = handleOf(id);
    },
  });
  const save = (index: number, result: TripModalResult) => {
    const { choice } = result;
    const mode = chosenMode(choice);
    const withMode = ({ start, destination }: Trip) => ({
      start,
      destination,
      mode,
    });
    // A new pair is one other than the trip had, so a drawn trip never comes back unchanged.
    const redrawn =
      result.tab === "draw" ? drawTrip(pairs, choice.range, random, trips[index].trip) : undefined;
    setLastUsed(choice);
    closeEditModal();
    const replacement: DraftTrip | undefined =
      result.tab === "pick"
        ? { trip: withMode(result.trip) }
        : redrawn && { trip: withMode(redrawn), drawnFrom: choice.range };
    if (replacement === undefined) return;
    setTrips((all) =>
      all.map((entry) => (entry.id === trips[index].id ? { id: entry.id, ...replacement } : entry)),
    );
    showRemoval(undefined);
    announce(`Resa ${index + 1} ändrad`);
  };
  const duplicate = (index: number) => {
    setTrips((current) =>
      [
        ...current.slice(0, index + 1),
        ...withIds([current[index]]),
        ...current.slice(index + 1),
      ].slice(0, ITINERARY_TRIPS.max),
    );
    showRemoval(undefined);
  };
  const remove = (index: number) => {
    const entry = trips[index];
    setTrips(trips.filter((_, other) => other !== index));
    showRemoval({ entry, index });
    announce(`Resa ${index + 1} borttagen`);
    // Focus the ✕ that took its place, the one before it for the last row, or the empty list.
    const left = trips.length - 1;
    focusAfterRender.current =
      left === 0 ? ".itinerary-empty" : removeButton(index < left ? index + 1 : index);
  };
  const undoRemoval = () => {
    if (removed === undefined) return;
    const { entry, index } = removed;
    setTrips((current) => [...current.slice(0, index), entry, ...current.slice(index)]);
    showRemoval(undefined);
    announce(`Resa ${index + 1} tillbaka`);
    focusAfterRender.current = removeButton(index + 1);
  };
  const [confirmingRemoveAll, setConfirmingRemoveAll] = useState(false);
  const cancelRemoveAll = () => {
    setConfirmingRemoveAll(false);
    focusAfterRender.current = MENU_BUTTON;
  };
  const removeAll = () => {
    setConfirmingRemoveAll(false);
    setTrips([]);
    showRemoval(undefined);
    announce("Alla resor borttagna");
    focusAfterRender.current = EMPTY_LIST;
  };

  return (
    <section ref={section} className="itinerary-builder" aria-labelledby="itinerary-heading">
      {banner}
      <p className="trip-number">Resplan</p>
      <h2 id="itinerary-heading">Bygg en resplan</h2>
      <TitleField title={title} onChange={setTitle} />
      <div className="itinerary-list-header">
        <h3 className="itinerary-list-heading">Resor</h3>
        <OverflowMenu
          label="Fler val"
          itemLabel="Ta bort alla resor"
          itemDisabled={trips.length === 0}
          onSelect={() => setConfirmingRemoveAll(true)}
        />
        <button
          type="button"
          className="itinerary-add-trips"
          disabled={room === 0}
          onClick={() => setAdding(true)}
        >
          <span aria-hidden="true">+</span> Lägg till{room === 0 && " (fullt)"}
        </button>
      </div>
      {trips.length === 0 ? (
        <p className="itinerary-empty" tabIndex={-1}>
          Inga resor än. Lägg till minst två.
        </p>
      ) : (
        <ol ref={list} className="itinerary-trips" aria-label="Resor">
          {trips.map((entry, index) => (
            <TripRow
              key={entry.id}
              graph={graph}
              entry={entry}
              number={index + 1}
              full={room === 0}
              dragOffset={dragged?.id === entry.id ? dragged.offset : undefined}
              handleProps={handleProps(entry.id)}
              onEdit={() => setEditingIndex(index)}
              onDuplicate={() => duplicate(index)}
              onRemove={() => remove(index)}
            />
          ))}
        </ol>
      )}
      {adding && (
        <TripModal
          graph={graph}
          largest={largest}
          heading="Lägg till resor"
          initial={lastUsed}
          submitLabel="Lägg till"
          room={room}
          onCancel={closeModal}
          onSubmit={add}
        />
      )}
      {confirmingRemoveAll && (
        <Modal
          label="Ta bort alla resor"
          className="remove-all-modal"
          onClose={cancelRemoveAll}
          footer={
            <>
              <button type="button" className="remove-all-cancel" onClick={cancelRemoveAll}>
                Avbryt
              </button>
              <button type="button" className="remove-all-confirm" onClick={removeAll}>
                Ta bort alla resor
              </button>
            </>
          }
        >
          <h2 className="remove-all-heading">
            Ta bort {trips.length === 1 ? "resan" : `alla ${trips.length} resor`}?
          </h2>
          <p className="remove-all-text">
            Namnet {title === "" ? "(inget än)" : `”${title}”`} behålls.
          </p>
        </Modal>
      )}
      {editingIndex !== undefined && (
        <TripModal
          graph={graph}
          largest={largest}
          heading="Ändra resa"
          initial={setupChoiceOfTrip(
            trips[editingIndex].trip.mode,
            trips[editingIndex].drawnFrom,
            lastUsed,
          )}
          initialPair={trips[editingIndex].drawnFrom ? undefined : trips[editingIndex].trip}
          submitLabel="Spara"
          onCancel={closeEditModal}
          onSubmit={(result) => save(editingIndex, result)}
        />
      )}
      <LinkBar
        count={trips.length}
        link={link}
        onPlay={onPlay}
        undo={
          removed && {
            number: removed.index + 1,
            onUndo: undoRemoval,
            onHold: hold,
          }
        }
      />
      <p role="status" className="visually-hidden itinerary-announcer">
        {announcement}
      </p>
    </section>
  );
}

function TitleField({ title, onChange }: { title: string; onChange: (title: string) => void }) {
  return (
    <div className="itinerary-title">
      <label htmlFor="itinerary-title">Namn (valfritt)</label>
      {/* Capped on change rather than by maxLength, which counts an emoji as two. */}
      <input
        id="itinerary-title"
        value={title}
        autoComplete="off"
        aria-describedby="itinerary-title-count"
        onChange={(event) => {
          const field = event.target;
          const edited = editTitle(title, field.value, field.selectionStart ?? undefined);
          // Set here, so React finds the value already right and leaves the caret alone.
          if (edited.title !== field.value) {
            field.value = edited.title;
            field.setSelectionRange(edited.caret, edited.caret);
          }
          onChange(edited.title);
        }}
      />
      <span id="itinerary-title-count" className="itinerary-title-count">
        {titleLength(title)}/{MAX_ITINERARY_TITLE}
        <span className="visually-hidden"> tecken</span>
      </span>
    </div>
  );
}

const rangeText = ({ min, max }: DistanceRange) => (min === max ? `${min}` : `${min}–${max}`);

/** A row of the trip list: its pair, or a drawn trip's range, over its mode, then its actions. */
function TripRow({
  graph,
  entry,
  number,
  full,
  dragOffset,
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
      className={
        dragOffset === undefined ? "itinerary-trip" : "itinerary-trip itinerary-trip--dragged"
      }
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
              Slumpad · <span className="itinerary-trip-range">avstånd {rangeText(drawnFrom)}</span>
            </>
          ) : (
            <>
              <span className="itinerary-start">{start}</span>
              {" → "}
              <span className="itinerary-destination">{destination}</span>
            </>
          )}
        </span>
        <span className="itinerary-trip-mode">{modeName(trip.mode)}</span>
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

/**
 * The sticky bar: how many trips, and Kopiera länk and Starta resplanen once the itinerary has two. Above it
 * float, without moving it, the latest removal's Ångra, the link to copy by hand when copying
 * failed, and the copy toast.
 */
function LinkBar({
  count,
  link,
  onPlay,
  undo,
}: {
  count: number;
  link?: string;
  onPlay: (link: string) => void;
  undo?: {
    number: number;
    onUndo: () => void;
    onHold: (held: boolean) => void;
  };
}) {
  const [overlays, setOverlays] = useState<HTMLDivElement | null>(null);
  return (
    <div className="itinerary-bar">
      <div className="itinerary-bar-content">
        <div className="itinerary-bar-overlays" ref={setOverlays}>
          {undo && <UndoToast {...undo} />}
        </div>
        <p className="itinerary-count" tabIndex={-1}>
          {count} av {ITINERARY_TRIPS.max} resor
          {count < ITINERARY_TRIPS.min && (
            <span className="itinerary-count-minimum"> · minst {ITINERARY_TRIPS.min}</span>
          )}
        </p>
        <CopyLinkButton
          url={link === undefined ? undefined : `${SITE_URL}${link}`}
          fallbackTarget={overlays}
        />
        <button
          type="button"
          className="itinerary-play"
          disabled={link === undefined}
          onClick={() => link !== undefined && onPlay(link)}
        >
          Starta resplanen
        </button>
      </div>
    </div>
  );
}
