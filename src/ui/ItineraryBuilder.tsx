import {
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Trip } from "../engine/game";
import type { BuilderDraft, DraftTrip } from "../freePlay/builderDraft";
import {
  defaultDistanceRange,
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
import { type ModeSetting, THINKING_TIME_RANGE } from "../freePlay/linkPayload";
import { DEFAULT_THINKING_TIME } from "../freePlay/modeRules";
import { type GraphVersion, kommunName } from "../graph/graphVersion";
import { shortestRouteLength } from "../graph/routes";
import { SITE_URL } from "../siteUrl";
import { CloseIcon } from "./CloseIcon";
import { useCopyToast } from "./useCopyToast";
import { DistanceRangeSlider } from "./DistanceRangeSlider";
import { MODES, ThinkingTimeField } from "./ModeCards";
import {
  PickTripForm,
  type TripChoiceTab,
  TripChoiceTabs,
  tripChoicePanelId,
  tripChoiceTabId,
} from "./TripChoice";
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

/** A trip in the itinerary being built, with a key for its row and whether it was drawn. */
type BuilderTrip = DraftTrip & { id: number };

/** How many trips Slumpa adds at once unless the player asks for another number. */
const DEFAULT_DRAW_COUNT = 5;

const ID_PREFIX = "itinerary";

/** How long Ångra stays up after a removal, unless the pointer or focus is on it. */
const UNDO_MS = 5000;

/**
 * The itinerary builder (Bygg en resplan): a title, the ordered trip list, a panel that adds
 * drawn or hand-picked trips, and a bar that copies or plays the itinerary's link. It can only
 * make valid itineraries: playable trips, at most 20 of them and a title of at most 40
 * characters; the link waits for the second trip.
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
  const [title, setTitle] = useState(initialDraft?.title ?? "");
  // A restored draft's rows are numbered from 1, and new rows after them.
  const [trips, setTrips] = useState<readonly BuilderTrip[]>(() =>
    (initialDraft?.trips ?? []).map((trip, index) => ({ ...trip, id: index + 1 })),
  );
  const nextId = useRef((initialDraft?.trips.length ?? 0) + 1);
  const withIds = (added: readonly DraftTrip[]) =>
    added.map((trip) => ({ ...trip, id: nextId.current++ }));
  // A drawn trip's pair shows only once the player asks for it, for this visit to the builder.
  const [revealed, setRevealed] = useState<ReadonlySet<number>>(new Set());
  useEffect(
    () => onDraftChange?.({ title, trips: trips.map(({ trip, drawn }) => ({ trip, drawn })) }),
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

  // What the next render focuses, and an element to keep where it is on screen across it.
  const section = useRef<HTMLElement>(null);
  const focusAfterRender = useRef<string>(undefined);
  const keepInPlace = useRef<{ element: HTMLElement; top: number }>(undefined);
  const addPanel = useRef<HTMLFieldSetElement>(null);
  const scrollRoom = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const kept = keepInPlace.current;
    keepInPlace.current = undefined;
    // Room made to keep the add panel in place goes once the list is empty again.
    if (trips.length === 0 && scrollRoom.current !== null) scrollRoom.current.style.height = "";
    if (kept !== undefined) keepOnScreen(kept, scrollRoom.current);
    const selector = focusAfterRender.current;
    focusAfterRender.current = undefined;
    if (selector !== undefined) section.current?.querySelector<HTMLElement>(selector)?.focus();
  });
  const removeButton = (number: number) => `[aria-label="Ta bort resa ${number}"]`;

  const { announcement, announce } = useAnnouncer();
  // The latest removal, until Ångra, its time running out, or another trip added.
  const [removed, setRemoved] = useState<{ entry: BuilderTrip; index: number }>();
  const [undoHeld, setUndoHeld] = useState(false);
  useEffect(() => {
    if (removed === undefined || undoHeld) return;
    const timer = setTimeout(() => setRemoved(undefined), UNDO_MS);
    return () => clearTimeout(timer);
  }, [removed, undoHeld]);

  const add = (added: readonly DraftTrip[], drawn: boolean) => {
    const count = Math.min(added.length, room);
    if (count === 0) return;
    // Rows go in above the panel: it stays put on screen, so the button just used never moves.
    if (addPanel.current !== null) {
      keepInPlace.current = {
        element: addPanel.current,
        top: addPanel.current.getBoundingClientRect().top,
      };
    }
    setTrips((current) => [...current, ...withIds(added)].slice(0, ITINERARY_TRIPS.max));
    setRemoved(undefined);
    announce(count === 1 ? `Resa ${trips.length + 1} tillagd` : `${count} resor tillagda`);
    focusAfterRender.current =
      count === room ? ".itinerary-count" : drawn ? ".itinerary-draw" : `#${ID_PREFIX}-start`;
  };
  const changeTrip = (id: number, mode: ModeSetting) =>
    setTrips((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, trip: { ...entry.trip, mode } } : entry,
      ),
    );
  const move = (index: number, by: -1 | 1) =>
    setTrips((current) => {
      const next = [...current];
      [next[index], next[index + by]] = [next[index + by], next[index]];
      return next;
    });
  const duplicate = (index: number) => {
    setTrips((current) =>
      [
        ...current.slice(0, index + 1),
        ...withIds([current[index]]),
        ...current.slice(index + 1),
      ].slice(0, ITINERARY_TRIPS.max),
    );
    setRemoved(undefined);
  };
  const remove = (index: number) => {
    const entry = trips[index];
    setTrips(trips.filter((_, other) => other !== index));
    setRemoved({ entry, index });
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
    setRemoved(undefined);
    setUndoHeld(false);
    announce(`Resa ${index + 1} tillbaka`);
    focusAfterRender.current = removeButton(index + 1);
  };
  const startOver = () => {
    setTitle("");
    setTrips([]);
    setRevealed(new Set());
    setRemoved(undefined);
  };

  return (
    <section ref={section} className="itinerary-builder" aria-labelledby="itinerary-heading">
      <p className="trip-number">Resplan</p>
      <h2 id="itinerary-heading">Bygg en resplan</h2>
      {banner}
      <TitleField title={title} onChange={setTitle} />
      <button
        type="button"
        className="itinerary-new"
        disabled={title === "" && trips.length === 0}
        onClick={startOver}
      >
        Ny resplan
      </button>
      {trips.length === 0 ? (
        <p className="itinerary-empty" tabIndex={-1}>
          Inga resor än. Lägg till minst två nedan.
        </p>
      ) : (
        <ol className="itinerary-trips" aria-label="Resor">
          {trips.map((entry, index) => (
            <TripRow
              key={entry.id}
              graph={graph}
              entry={entry}
              number={index + 1}
              hidden={entry.drawn && !revealed.has(entry.id)}
              first={index === 0}
              last={index === trips.length - 1}
              full={room === 0}
              onReveal={() => setRevealed(new Set([...revealed, entry.id]))}
              onModeChange={(mode) => changeTrip(entry.id, mode)}
              onMove={(by) => move(index, by)}
              onDuplicate={() => duplicate(index)}
              onRemove={() => remove(index)}
            />
          ))}
        </ol>
      )}
      <AddTrips
        panelRef={addPanel}
        graph={graph}
        room={room}
        random={random}
        onAdd={(added, mode, drawn) =>
          add(
            added.map((trip) => ({ trip: { ...trip, mode }, drawn })),
            drawn,
          )
        }
      />
      <LinkBar
        count={trips.length}
        link={link}
        onPlay={onPlay}
        undo={
          removed && {
            number: removed.index + 1,
            onUndo: undoRemoval,
            onHold: setUndoHeld,
          }
        }
      />
      <div ref={scrollRoom} className="itinerary-scroll-room" aria-hidden="true" />
      <p role="status" className="visually-hidden itinerary-announcer">
        {announcement}
      </p>
    </section>
  );
}

/**
 * Scrolls so `kept.element` is back where it was on screen, `top` from the viewport. A page too
 * short to scroll that far first grows `room` at its end by what's missing.
 */
function keepOnScreen(kept: { element: HTMLElement; top: number }, room: HTMLElement | null) {
  const moved = kept.element.getBoundingClientRect().top - kept.top;
  if (moved === 0) return;
  const target = window.scrollY + moved;
  const scrollEnd = document.documentElement.scrollHeight - window.innerHeight;
  if (room !== null && target > scrollEnd) {
    room.style.height = `${room.offsetHeight + target - scrollEnd}px`;
  }
  window.scrollTo(0, target);
}

/**
 * A polite announcement for the builder's live region. The same words twice in a row differ by
 * a trailing no-break space, so screen readers read them again.
 */
function useAnnouncer(): { announcement: string; announce: (text: string) => void } {
  const [announcement, setAnnouncement] = useState("");
  const announce = (text: string) =>
    setAnnouncement((previous) => (previous === text ? `${text}\u00a0` : text));
  return { announcement, announce };
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

function TripRow({
  graph,
  entry,
  number,
  hidden,
  first,
  last,
  full,
  onReveal,
  onModeChange,
  onMove,
  onDuplicate,
  onRemove,
}: {
  graph: GraphVersion;
  entry: BuilderTrip;
  number: number;
  hidden: boolean;
  first: boolean;
  last: boolean;
  full: boolean;
  onReveal: () => void;
  onModeChange: (mode: ModeSetting) => void;
  onMove: (by: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const { trip } = entry;
  const start = kommunName(graph, trip.start);
  const destination = kommunName(graph, trip.destination);
  return (
    <li className="itinerary-trip">
      <span className="itinerary-trip-number" aria-hidden="true">
        {number}
      </span>
      <span className="itinerary-trip-what">
        {/* Cut short with an ellipsis when it doesn't fit; the whole pair stays in the text. */}
        <span
          className="itinerary-trip-pair"
          title={hidden ? undefined : `${start} → ${destination}`}
        >
          {hidden ? (
            <>
              <span aria-hidden="true">🎲</span>{" "}
              <span className="itinerary-drawn-word">Slumpad · </span>avstånd{" "}
              {shortestRouteLength(graph, trip.start, trip.destination)}
            </>
          ) : (
            <>
              <span className="itinerary-start">{start}</span>
              {" → "}
              <span className="itinerary-destination">{destination}</span>
            </>
          )}
        </span>
        {hidden && (
          <button
            type="button"
            className="itinerary-reveal"
            aria-label={`Visa resa ${number}`}
            onClick={onReveal}
          >
            Visa
          </button>
        )}
      </span>
      <ModeSelect
        id={`itinerary-trip-${entry.id}`}
        label={`Läge, resa ${number}`}
        labelHidden
        compactThinkingTime={`Betänketid, resa ${number}`}
        mode={trip.mode}
        onChange={onModeChange}
      />
      <span className="itinerary-trip-actions">
        <button
          type="button"
          aria-label={`Flytta upp resa ${number}`}
          disabled={first}
          onClick={() => onMove(-1)}
        >
          <span aria-hidden="true">↑</span>
        </button>
        <button
          type="button"
          aria-label={`Flytta ner resa ${number}`}
          disabled={last}
          onClick={() => onMove(1)}
        >
          <span aria-hidden="true">↓</span>
        </button>
        <button
          type="button"
          aria-label={`Dubblera resa ${number}`}
          disabled={full}
          onClick={onDuplicate}
        >
          <span aria-hidden="true">⧉</span>
        </button>
        <button type="button" aria-label={`Ta bort resa ${number}`} onClick={onRemove}>
          <span aria-hidden="true">✕</span>
        </button>
      </span>
    </li>
  );
}

/**
 * A trip's mode as a dropdown, and for Tidspress its betänketid beside it: the setup's slider, or
 * given `compactThinkingTime`'s label, a dropdown of seconds that keeps a trip row on one line.
 */
function ModeSelect({
  id,
  label,
  labelHidden = false,
  compactThinkingTime,
  mode,
  onChange,
}: {
  /** Unique on the page; the dropdowns are named after it. */
  id: string;
  label: string;
  labelHidden?: boolean;
  compactThinkingTime?: string;
  mode: ModeSetting;
  onChange: (mode: ModeSetting) => void;
}) {
  const choose = (kind: ModeSetting["kind"]) =>
    onChange(
      kind === "timed"
        ? {
            kind,
            thinkingTime: mode.kind === "timed" ? mode.thinkingTime : DEFAULT_THINKING_TIME,
          }
        : { kind },
    );
  const chooseSeconds = (seconds: number) => onChange({ kind: "timed", thinkingTime: seconds });
  return (
    <span className="itinerary-mode">
      <label htmlFor={`${id}-mode`} className={labelHidden ? "visually-hidden" : undefined}>
        {label}
      </label>
      <select
        id={`${id}-mode`}
        value={mode.kind}
        onChange={(event) => choose(event.target.value as ModeSetting["kind"])}
      >
        {MODES.map(({ kind, name }) => (
          <option key={kind} value={kind}>
            {name}
          </option>
        ))}
      </select>
      {mode.kind === "timed" &&
        (compactThinkingTime === undefined ? (
          <ThinkingTimeField
            id={`${id}-thinking-time`}
            labelHidden
            seconds={mode.thinkingTime}
            onChange={chooseSeconds}
          />
        ) : (
          <>
            <label htmlFor={`${id}-thinking-time`} className="visually-hidden">
              {compactThinkingTime}
            </label>
            <select
              id={`${id}-thinking-time`}
              className="itinerary-thinking-time"
              value={mode.thinkingTime}
              onChange={(event) => chooseSeconds(Number(event.target.value))}
            >
              {THINKING_TIMES.map((seconds) => (
                <option key={seconds} value={seconds}>
                  {seconds} s
                </option>
              ))}
            </select>
          </>
        ))}
    </span>
  );
}

/** Every whole second a betänketid can be. */
const THINKING_TIMES = Array.from(
  { length: THINKING_TIME_RANGE.max - THINKING_TIME_RANGE.min + 1 },
  (_, index) => THINKING_TIME_RANGE.min + index,
);

/**
 * Lägg till resor: the mode for new trips, then Slumpa, which draws a number of trips at once,
 * or Välj själv, which adds one hand-picked trip. Disabled once the itinerary is full.
 */
function AddTrips({
  panelRef,
  graph,
  room,
  random,
  onAdd,
}: {
  panelRef: RefObject<HTMLFieldSetElement | null>;
  graph: GraphVersion;
  /** How many more trips fit. */
  room: number;
  random: RandomSource;
  onAdd: (trips: readonly Trip[], mode: ModeSetting, drawn: boolean) => void;
}) {
  const pairs = useMemo(() => tripPairs(graph), [graph]);
  const largest = largestDistance(pairs);
  const [range, setRange] = useState(() => defaultDistanceRange(largest));
  const [mode, setMode] = useState<ModeSetting>({ kind: "standard" });
  const [tab, setTab] = useState<TripChoiceTab>("draw");
  const [count, setCount] = useState(DEFAULT_DRAW_COUNT);
  // Antal never changes by itself but to follow the room left down, never back up: at least 1.
  const roomForCount = Math.max(1, room);
  if (count > roomForCount) setCount(roomForCount);
  const drawCount = Math.min(count, roomForCount);
  const [lastDrawn, setLastDrawn] = useState<Trip>();
  const full = room === 0;

  const draw = () => {
    const drawn = drawTrips(pairs, range, Math.min(drawCount, room), random, lastDrawn);
    if (drawn.length === 0) return;
    setLastDrawn(drawn.at(-1));
    onAdd(drawn, mode, true);
  };

  return (
    <fieldset ref={panelRef} className="itinerary-add" disabled={full}>
      <legend>Lägg till resor{full && " (fullt)"}</legend>
      <ModeSelect id="itinerary-new" label="Läge för nya resor" mode={mode} onChange={setMode} />
      <TripChoiceTabs idPrefix={ID_PREFIX} selected={tab} onSelect={setTab} />
      <div
        id={tripChoicePanelId(ID_PREFIX, "draw")}
        role="tabpanel"
        aria-labelledby={tripChoiceTabId(ID_PREFIX, "draw")}
        className="free-play-panel"
        hidden={tab !== "draw"}
      >
        <DistanceRangeSlider range={range} largest={largest} onChange={setRange} />
        <Stepper value={drawCount} max={roomForCount} onChange={setCount} />
        <button type="button" className="free-play-go itinerary-draw" onClick={draw}>
          <span aria-hidden="true">🎲</span> Lägg till {drawCount}{" "}
          {drawCount === 1 ? "slumpad" : "slumpade"}
        </button>
      </div>
      <PickTripForm
        graph={graph}
        idPrefix={ID_PREFIX}
        hidden={tab !== "pick"}
        submitLabel="Lägg till"
        clearOnPick
        onPick={(trip) => onAdd([trip], mode, false)}
      />
    </fieldset>
  );
}

/** How many trips Slumpa adds: 1 up to the room left. */
function Stepper({
  value,
  max,
  onChange,
}: {
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="itinerary-stepper">
      <span id="itinerary-count-label">Antal</span>
      <button
        type="button"
        aria-label="Färre resor"
        disabled={value <= 1}
        onClick={() => onChange(value - 1)}
      >
        <span aria-hidden="true">−</span>
      </button>
      <output aria-labelledby="itinerary-count-label" aria-live="polite">
        {value}
      </output>
      <button
        type="button"
        aria-label="Fler resor"
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        <span aria-hidden="true">+</span>
      </button>
    </div>
  );
}

/**
 * The sticky bar: how many trips, and Kopiera länk and Spela once the itinerary has two. Above it
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
  undo?: { number: number; onUndo: () => void; onHold: (held: boolean) => void };
}) {
  const { toast, copy } = useCopyToast();
  // The link that failed to copy, shown until a copy works or the itinerary is edited.
  const [uncopied, setUncopied] = useState<string>();
  const [linkCopied, setLinkCopied] = useState(link);
  if (link !== linkCopied) {
    setLinkCopied(link);
    setUncopied(undefined);
  }
  const copyLink = async (url: string) => setUncopied((await copy(url)) ? undefined : url);

  return (
    <div className="itinerary-bar">
      <div className="itinerary-bar-content">
        <div className="itinerary-bar-overlays">
          {undo && <UndoToast {...undo} />}
          {uncopied !== undefined && (
            <CopyFallback key={uncopied} url={uncopied} onClose={() => setUncopied(undefined)} />
          )}
          <p
            role="status"
            aria-live="polite"
            className={uncopied === undefined ? "itinerary-toast" : "visually-hidden"}
          >
            {toast}
          </p>
        </div>
        <p className="itinerary-count" tabIndex={-1}>
          {count} av {ITINERARY_TRIPS.max} resor
          {count < ITINERARY_TRIPS.min && (
            <span className="itinerary-count-minimum"> · minst {ITINERARY_TRIPS.min}</span>
          )}
        </p>
        <button
          type="button"
          className="itinerary-copy"
          disabled={link === undefined}
          onClick={() => link !== undefined && void copyLink(`${SITE_URL}${link}`)}
        >
          Kopiera länk
        </button>
        <button
          type="button"
          className="itinerary-play"
          disabled={link === undefined}
          onClick={() => link !== undefined && onPlay(link)}
        >
          Spela
        </button>
      </div>
    </div>
  );
}

/** "Resa N borttagen" and Ångra; held up while the pointer or focus is on it. */
function UndoToast({
  number,
  onUndo,
  onHold,
}: {
  number: number;
  onUndo: () => void;
  onHold: (held: boolean) => void;
}) {
  return (
    <div
      className="itinerary-undo"
      onPointerEnter={() => onHold(true)}
      onPointerLeave={() => onHold(false)}
      onFocus={() => onHold(true)}
      onBlur={() => onHold(false)}
    >
      <span>Resa {number} borttagen</span>
      <button type="button" onClick={onUndo}>
        Ångra
      </button>
    </div>
  );
}

/** The link in a read-only field, selected, for the player to copy by hand. */
function CopyFallback({ url, onClose }: { url: string; onClose: () => void }) {
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);
  return (
    <div className="itinerary-copy-fallback">
      <label htmlFor="itinerary-copy-fallback">Kunde inte kopiera. Kopiera länken själv:</label>
      <input
        ref={field}
        id="itinerary-copy-fallback"
        readOnly
        value={url}
        onFocus={(event) => event.target.select()}
      />
      <button type="button" aria-label="Stäng" onClick={onClose}>
        <CloseIcon />
      </button>
    </div>
  );
}
