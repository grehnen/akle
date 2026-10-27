import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Trip } from "../engine/game";
import type { BuilderDraft, DraftTrip } from "../freePlay/builderDraft";
import type { LinkedTrip } from "../freePlay/linkPayload";
import {
  defaultDistanceRange,
  drawTrip,
  drawTrips,
  largestDistance,
  type RandomSource,
  tripPairs,
} from "../freePlay/draw";
import { ITINERARY_TRIPS, itineraryLinkPath } from "../freePlay/itineraryLink";
import { DEFAULT_THINKING_TIME } from "../freePlay/modeRules";
import { chosenMode, setupChoiceOfTrip, type SetupChoice } from "../freePlay/setupChoice";
import type { GraphVersion } from "../graph/graphVersion";
import { LinkBar } from "./ItineraryLinkBar";
import { TitleField } from "./ItineraryTitleField";
import { type BuilderTrip, TripRow } from "./ItineraryTripRow";
import { OverflowMenu } from "./OverflowMenu";
import { RemoveAllModal } from "./RemoveAllModal";
import { TripModal, type TripModalResult } from "./TripModal";
import { useUndoRemoval } from "./UndoToast";
import { useAnnouncer } from "./useAnnouncer";
import { useReorderableList } from "./useReorderableList";
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
    const added: DraftTrip[] =
      result.tab === "pick"
        ? [{ trip: inChosenMode(result.trip, choice) }]
        : drawTrips(
            pairs,
            choice.range,
            Math.min(result.count, room),
            random,
            trips.at(-1)?.trip,
          ).map((pair) => ({ trip: inChosenMode(pair, choice), drawnFrom: choice.range }));
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
  const { dragged, lifted, handleProps } = useReorderableList(list, {
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
    onAnnounce: ({ kind, position, count }) =>
      announce(
        {
          lifted: `Resa ${position} lyft. Pil upp och ner flyttar, mellanslag släpper, Esc avbryter.`,
          moved: `Plats ${position} av ${count}`,
          dropped: `Resa släppt på plats ${position} av ${count}`,
          cancelled: `Flytten avbruten. Resa ${position} är kvar på plats ${position} av ${count}`,
        }[kind],
      ),
  });
  const save = (index: number, result: TripModalResult) => {
    const { choice } = result;
    // A new pair is one other than the trip had, so a drawn trip never comes back unchanged.
    const redrawn =
      result.tab === "draw" ? drawTrip(pairs, choice.range, random, trips[index].trip) : undefined;
    setLastUsed(choice);
    closeEditModal();
    const replacement: DraftTrip | undefined =
      result.tab === "pick"
        ? { trip: inChosenMode(result.trip, choice) }
        : redrawn && { trip: inChosenMode(redrawn, choice), drawnFrom: choice.range };
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
              lifted={lifted === entry.id}
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
        <RemoveAllModal
          tripCount={trips.length}
          title={title}
          onCancel={cancelRemoveAll}
          onConfirm={removeAll}
        />
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

const inChosenMode = ({ start, destination }: Trip, choice: SetupChoice): LinkedTrip => ({
  start,
  destination,
  mode: chosenMode(choice),
});
