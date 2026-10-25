// PROTOTYPE (F): throwaway. Never merge to main.
// The redesigned itinerary builder on the real /resplan route, with four places for the
// "clear all trips" button, switchable via `?variant=a|b|c|d` and the pink bar:
//   a: a quiet text button in the sticky footer, beside the count
//   b: in the "Resor" list header, left of "+ Lägg till"
//   c: a quiet text button under the last row
//   d: a ⋯ overflow menu in the list header
// Other params: `etikett=tom|alla` (the button says "Töm" or "Ta bort alla"; each variant has its
// own default), `start=tom|full` (start empty or at 20 trips instead of the 6-trip example),
// `banner=0` (hide the resume banner), `telefon=1` (the page in a 390 px frame).
// State is in memory only: nothing is saved, and Spela only logs the link.
import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { Trip } from "../engine/game";
import {
  defaultDistanceRange,
  type DistanceRange,
  drawTrips,
  largestDistance,
  type TripPairs,
  tripPairs,
} from "../freePlay/draw";
import { endpointSuggestions, pickedTrip, resolveEndpoint } from "../freePlay/endpoints";
import {
  editTitle,
  ITINERARY_TRIPS,
  MAX_ITINERARY_TITLE,
  titleLength,
} from "../freePlay/itineraryLink";
import type { ModeSetting } from "../freePlay/linkPayload";
import { type GraphVersion, kommunName } from "../graph/graphVersion";
import { DistanceRangeSlider } from "./DistanceRangeSlider";
import { EndpointField } from "./EndpointField";
import { MODE_NAMES } from "./messages";
import { ModeCards, ThinkingTimeField } from "./ModeCards";
import { pill, PrototypeSwitcher } from "./PrototypeSwitcher";
import {
  type TripChoiceTab,
  TripChoiceTabs,
  tripChoicePanelId,
  tripChoiceTabId,
} from "./TripChoice";
import "./FreePlayScreen.css";
import "./ItineraryBuilder.css";
import "./ItineraryBuilderPrototype.css";

// ---------------------------------------------------------------------------------------------
// Prototype settings, read from and written to the URL

const VARIANTS = [
  { key: "a", name: "I sidfoten" },
  { key: "b", name: "I listrubriken" },
  { key: "c", name: "Under listan" },
  { key: "d", name: "⋯-meny" },
] as const;
type VariantKey = (typeof VARIANTS)[number]["key"];

const DEFAULT_LABEL: Record<VariantKey, LabelKey> = { a: "tom", b: "alla", c: "alla", d: "alla" };
type LabelKey = "tom" | "alla";
const LABELS: Record<LabelKey, string> = { tom: "Töm", alla: "Ta bort alla" };

type StartKey = "exempel" | "tom" | "full";
const START_NAMES: Record<StartKey, string> = { exempel: "6 resor", tom: "Tom", full: "Full (20)" };

type Settings = {
  variant: VariantKey;
  label: LabelKey;
  start: StartKey;
  banner: boolean;
  phone: boolean;
};

function readSettings(): Settings {
  const params = new URLSearchParams(window.location.search);
  const asked = params.get("variant")?.toLowerCase();
  const variant = VARIANTS.find(({ key }) => key === asked)?.key ?? "a";
  const label = params.get("etikett");
  const start = params.get("start");
  return {
    variant,
    label: label === "tom" || label === "alla" ? label : DEFAULT_LABEL[variant],
    start: start === "tom" || start === "full" ? start : "exempel",
    banner: params.get("banner") !== "0",
    phone: params.get("telefon") === "1",
  };
}

function settingsQuery({ variant, label, start, banner, phone }: Settings): URLSearchParams {
  const params = new URLSearchParams();
  params.set("variant", variant);
  if (label !== DEFAULT_LABEL[variant]) params.set("etikett", label);
  if (start !== "exempel") params.set("start", start);
  if (!banner) params.set("banner", "0");
  if (phone) params.set("telefon", "1");
  return params;
}

function useSettings() {
  const [settings, setSettings] = useState(readSettings);
  const update = (change: Partial<Settings>) => {
    let next = { ...settings, ...change };
    // A new variant takes its own label unless the label is what changed.
    if (change.variant !== undefined && change.label === undefined) {
      next = { ...next, label: DEFAULT_LABEL[next.variant] };
    }
    setSettings(next);
    window.history.replaceState(null, "", `${window.location.pathname}?${settingsQuery(next)}`);
  };
  return [settings, update] as const;
}

/** Whether this page is the one inside the phone frame. */
const inFrame = () => new URLSearchParams(window.location.search).get("ram") === "1";

/** Whether main.tsx should render the phone frame page instead of the app. */
export function wantsPhoneFrame(): boolean {
  return readSettings().phone && !inFrame() && window.location.pathname.startsWith("/resplan");
}

function PrototypeBar({
  settings,
  update,
}: {
  settings: Settings;
  update: (change: Partial<Settings>) => void;
}) {
  const active = { background: "#ff2fb4", color: "#000", boxShadow: "inset 0 0 0 2px #000" };
  const starts: StartKey[] = ["exempel", "tom", "full"];
  return (
    <PrototypeSwitcher
      variants={VARIANTS}
      current={settings.variant}
      onChange={(key) => update({ variant: key as VariantKey })}
      bottom={settings.phone ? undefined : "5.5rem"}
    >
      <button
        type="button"
        style={pill}
        onClick={() => update({ label: settings.label === "tom" ? "alla" : "tom" })}
      >
        ”{LABELS[settings.label]}”
      </button>
      <button
        type="button"
        style={pill}
        onClick={() =>
          update({ start: starts[(starts.indexOf(settings.start) + 1) % starts.length] })
        }
      >
        Start: {START_NAMES[settings.start]}
      </button>
      <button
        type="button"
        style={{ ...pill, ...(settings.banner ? active : {}) }}
        aria-pressed={settings.banner}
        onClick={() => update({ banner: !settings.banner })}
      >
        Banner
      </button>
      <button
        type="button"
        style={{ ...pill, ...(settings.phone ? active : {}) }}
        aria-pressed={settings.phone}
        onClick={() => update({ phone: !settings.phone })}
      >
        Telefon 390px
      </button>
    </PrototypeSwitcher>
  );
}

/** `?telefon=1`: the same page, framed at 390 px, so its media queries see a phone. */
export function PhoneFramePage() {
  const [settings, update] = useSettings();
  const query = settingsQuery({ ...settings, phone: false });
  query.set("ram", "1");
  return (
    <div className="ibp-phone-page">
      <p className="ibp-phone-note">
        <strong>PROTOTYP (F) · Bygg en resplan</strong> · variant{" "}
        <strong>
          {settings.variant.toUpperCase()} ({VARIANTS.find((v) => v.key === settings.variant)?.name}
          )
        </strong>{" "}
        · telefon, 390 × 844
      </p>
      <iframe
        key={query.toString()}
        className="ibp-phone-frame"
        title="Telefon, 390 px"
        src={`/resplan?${query}`}
      />
      <PrototypeBar settings={settings} update={update} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The builder

type Entry = {
  id: number;
  trip: Trip;
  mode: ModeSetting;
  /** The range a drawn trip was drawn from; a picked trip has none. */
  drawn?: DistanceRange;
};

const DEFAULT_THINKING_TIME = 10;
const MAX = ITINERARY_TRIPS.max;

const rangeText = ({ min, max }: DistanceRange) => (min === max ? `${min}` : `${min}–${max}`);
const sameRange = (a: DistanceRange, b: DistanceRange) => a.min === b.min && a.max === b.max;
const modeText = (mode: ModeSetting) =>
  mode.kind === "timed" ? `${MODE_NAMES.timed} · ${mode.thinkingTime} s` : MODE_NAMES[mode.kind];

/** A seeded random source, so the example list is the same on every load. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EXAMPLE: { mode: ModeSetting; drawn?: DistanceRange }[] = [
  { mode: { kind: "standard" } },
  { mode: { kind: "timed", thinkingTime: 10 }, drawn: { min: 3, max: 8 } },
  { mode: { kind: "unlimited" }, drawn: { min: 5, max: 12 } },
  { mode: { kind: "tie-breaker" } },
  { mode: { kind: "standard" }, drawn: { min: 3, max: 8 } },
  { mode: { kind: "timed", thinkingTime: 20 } },
];

function seedEntries(pairs: TripPairs, start: StartKey): Entry[] {
  if (start === "tom") return [];
  const random = seeded(7);
  const plan =
    start === "full"
      ? Array.from({ length: MAX }, (_, index) => EXAMPLE[index % EXAMPLE.length])
      : EXAMPLE;
  return plan.map(({ mode, drawn }, index) => ({
    id: index + 1,
    trip: drawTrips(pairs, drawn ?? { min: 4, max: 10 }, 1, random)[0],
    mode,
    drawn,
  }));
}

type ModalState = { kind: "add" } | { kind: "edit"; id: number } | { kind: "confirm-clear" };

export function ItineraryBuilderPrototype({
  graph,
  onPlay,
}: {
  graph: GraphVersion;
  onPlay: (link: string) => void;
}) {
  const [settings, update] = useSettings();
  useEffect(() => {
    if (inFrame()) document.documentElement.classList.add("ibp-framed");
  }, []);
  return (
    <>
      <Builder key={settings.start} graph={graph} onPlay={onPlay} settings={settings} />
      {!inFrame() && <PrototypeBar settings={settings} update={update} />}
    </>
  );
}

function Builder({
  graph,
  onPlay,
  settings,
}: {
  graph: GraphVersion;
  onPlay: (link: string) => void;
  settings: Settings;
}) {
  const { variant } = settings;
  const clearLabel = LABELS[settings.label];
  const pairs = useMemo(() => tripPairs(graph), [graph]);
  const largest = largestDistance(pairs);
  const [title, setTitle] = useState(settings.start === "tom" ? "" : "Kustresan");
  const [entries, setEntries] = useState<Entry[]>(() => seedEntries(pairs, settings.start));
  const nextId = useRef(entries.length + 1);
  const [modal, setModal] = useState<ModalState>();
  // What the add modal opens on: the mode and range last used this visit.
  const [lastUsed, setLastUsed] = useState({
    mode: { kind: "standard" } as ModeSetting,
    thinkingTime: DEFAULT_THINKING_TIME,
    range: defaultDistanceRange(largest),
  });
  const [announcement, setAnnouncement] = useState("");
  const room = MAX - entries.length;
  const full = room === 0;
  const playable = entries.length >= ITINERARY_TRIPS.min;
  const fakeLink = `/resplan?namn=${encodeURIComponent(title)}&r=PROTOTYP`;

  const draw = (range: DistanceRange, count: number, previous?: Trip) =>
    drawTrips(pairs, range, count, Math.random, previous);

  const remember = (mode: ModeSetting, range: DistanceRange) =>
    setLastUsed((last) => ({
      mode,
      thinkingTime: mode.kind === "timed" ? mode.thinkingTime : last.thinkingTime,
      range,
    }));

  const onAdd = (result: ModalResult) => {
    remember(result.mode, result.range);
    const added: Entry[] =
      result.tab === "pick" && result.trip
        ? [{ id: nextId.current++, trip: result.trip, mode: result.mode }]
        : draw(result.range, Math.min(result.count, room), entries.at(-1)?.trip).map((trip) => ({
            id: nextId.current++,
            trip,
            mode: result.mode,
            drawn: result.range,
          }));
    setEntries([...entries, ...added].slice(0, MAX));
    setAnnouncement(
      added.length === 1 ? `Resa ${entries.length + 1} tillagd` : `${added.length} resor tillagda`,
    );
    setModal(undefined);
  };

  const onEdit = (id: number, result: ModalResult) => {
    remember(result.mode, result.range);
    setEntries((current) =>
      current.map((entry) => {
        if (entry.id !== id) return entry;
        if (result.tab === "pick" && result.trip) {
          return { id, trip: result.trip, mode: result.mode };
        }
        // Drawn: a fresh draw from Slumpa om, else the pair kept when only the mode changed,
        // else a new draw in the new range.
        const keep = entry.drawn !== undefined && sameRange(entry.drawn, result.range);
        const trip =
          result.redrawn ??
          (keep ? entry.trip : (draw(result.range, 1, entry.trip)[0] ?? entry.trip));
        return { id, trip, mode: result.mode, drawn: result.range };
      }),
    );
    setModal(undefined);
  };

  const duplicate = (index: number) => {
    if (full) return;
    setEntries([
      ...entries.slice(0, index + 1),
      { ...entries[index], id: nextId.current++ },
      ...entries.slice(index + 1),
    ]);
  };
  const remove = (index: number) => {
    setEntries(entries.filter((_, other) => other !== index));
    setAnnouncement(`Resa ${index + 1} borttagen`);
  };
  const clearAll = () => {
    setEntries([]);
    setModal(undefined);
    setAnnouncement("Alla resor borttagna. Namnet behölls.");
  };
  const askClear = () => setModal({ kind: "confirm-clear" });

  const editing = modal?.kind === "edit" ? entries.findIndex((e) => e.id === modal.id) : -1;
  const editedEntry = editing >= 0 ? entries[editing] : undefined;

  const quietClear = (className: string) => (
    <button
      type="button"
      className={`ibp-quiet ${className}`}
      disabled={entries.length === 0}
      onClick={askClear}
    >
      {clearLabel}
    </button>
  );

  return (
    <section className="itinerary-builder ibp" aria-labelledby="itinerary-heading">
      <p className="trip-number">Resplan</p>
      <h2 id="itinerary-heading">Bygg en resplan</h2>
      {settings.banner && (
        <a className="resume-link ibp-resume" href="#fortsatt" onClick={(e) => e.preventDefault()}>
          <strong>Oavslutad resplan</strong>
          <span className="ibp-resume-detail">Söndagsturen · resa 2 av 3</span>
          <span className="ibp-resume-go">Fortsätt ›</span>
        </a>
      )}
      <TitleField title={title} onChange={setTitle} />

      <div className="ibp-list-header">
        <h3 className="ibp-list-heading">Resor</h3>
        {variant === "b" && quietClear("ibp-clear-header")}
        {variant === "d" && (
          <OverflowMenu label={clearLabel} disabled={entries.length === 0} onClear={askClear} />
        )}
        <button
          type="button"
          className="ibp-add"
          disabled={full}
          onClick={() => setModal({ kind: "add" })}
        >
          <span aria-hidden="true">+</span> Lägg till{full && " (fullt)"}
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="itinerary-empty" tabIndex={-1}>
          Inga resor än. Lägg till minst två.
        </p>
      ) : (
        <TripList
          graph={graph}
          entries={entries}
          full={full}
          onReorder={setEntries}
          onAnnounce={setAnnouncement}
          onEdit={(id) => setModal({ kind: "edit", id })}
          onDuplicate={duplicate}
          onRemove={remove}
        />
      )}
      {variant === "c" && entries.length > 0 && (
        <div className="ibp-below-list">{quietClear("ibp-clear-below")}</div>
      )}

      <div className="itinerary-bar">
        <div className="itinerary-bar-content">
          <div className="ibp-bar-left">
            <p className="itinerary-count" tabIndex={-1}>
              {entries.length} av {MAX} resor
              {entries.length < ITINERARY_TRIPS.min && (
                <span className="itinerary-count-minimum"> · minst {ITINERARY_TRIPS.min}</span>
              )}
            </p>
            {variant === "a" && quietClear("ibp-clear-footer")}
          </div>
          <button
            type="button"
            className="itinerary-copy"
            disabled={!playable}
            onClick={() => setAnnouncement("Länk kopierad (låtsas)")}
          >
            Kopiera länk
          </button>
          <button
            type="button"
            className="itinerary-play"
            disabled={!playable}
            onClick={() => {
              console.info("PROTOTYP: Spela", fakeLink);
              setAnnouncement("Spela (låtsas, prototypen spelar inte)");
              void onPlay;
            }}
          >
            Spela
          </button>
        </div>
      </div>

      <p className="ibp-status" role="status">
        {announcement}
      </p>

      {modal?.kind === "add" && (
        <TripModal
          graph={graph}
          pairs={pairs}
          largest={largest}
          heading="Lägg till resor"
          submitLabel="Lägg till"
          room={room}
          initial={{ ...lastUsed, tab: "draw" }}
          onCancel={() => setModal(undefined)}
          onSubmit={onAdd}
        />
      )}
      {editedEntry && (
        <TripModal
          graph={graph}
          pairs={pairs}
          largest={largest}
          heading={`Ändra resa ${editing + 1}`}
          submitLabel="Spara"
          editing={editedEntry}
          initial={{
            mode: editedEntry.mode,
            thinkingTime:
              editedEntry.mode.kind === "timed"
                ? editedEntry.mode.thinkingTime
                : lastUsed.thinkingTime,
            range: editedEntry.drawn ?? lastUsed.range,
            tab: editedEntry.drawn ? "draw" : "pick",
            start: editedEntry.drawn ? "" : kommunName(graph, editedEntry.trip.start),
            destination: editedEntry.drawn ? "" : kommunName(graph, editedEntry.trip.destination),
          }}
          onCancel={() => setModal(undefined)}
          onSubmit={(result) => onEdit(editedEntry.id, result)}
        />
      )}
      {modal?.kind === "confirm-clear" && (
        <Dialog
          className="ibp-confirm"
          label="Ta bort alla resor"
          onCancel={() => setModal(undefined)}
        >
          <h3 className="ibp-confirm-heading">
            Ta bort {entries.length === 1 ? "resan" : `alla ${entries.length} resor`}?
          </h3>
          <p className="ibp-confirm-text">
            Namnet {title === "" ? "(inget än)" : `”${title}”`} behålls.
          </p>
          <div className="ibp-dialog-buttons">
            <button
              type="button"
              className="itinerary-copy"
              autoFocus
              onClick={() => setModal(undefined)}
            >
              Avbryt
            </button>
            <button type="button" className="ibp-danger" onClick={clearAll}>
              {clearLabel}
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}

function TitleField({ title, onChange }: { title: string; onChange: (title: string) => void }) {
  return (
    <div className="itinerary-title">
      <label htmlFor="itinerary-title">Namn (valfritt)</label>
      <input
        id="itinerary-title"
        value={title}
        autoComplete="off"
        onChange={(event) => {
          const field = event.target;
          onChange(editTitle(title, field.value, field.selectionStart ?? undefined).title);
        }}
      />
      <span className="itinerary-title-count">
        {titleLength(title)}/{MAX_ITINERARY_TITLE}
      </span>
    </div>
  );
}

function OverflowMenu({
  label,
  disabled,
  onClear,
}: {
  label: string;
  disabled: boolean;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);
  return (
    <div ref={root} className="ibp-overflow">
      <button
        type="button"
        className="ibp-overflow-button"
        aria-label="Fler val"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => event.key === "Escape" && setOpen(false)}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open && (
        <div className="ibp-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            autoFocus
            disabled={disabled}
            onClick={() => {
              setOpen(false);
              onClear();
            }}
            onKeyDown={(event) => event.key === "Escape" && setOpen(false)}
          >
            {label === "Töm" ? "Töm resplanen" : "Ta bort alla resor"}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The list, reordered by dragging ⠿ (pointer events) or by the keyboard on ⠿

function TripList({
  graph,
  entries,
  full,
  onReorder,
  onAnnounce,
  onEdit,
  onDuplicate,
  onRemove,
}: {
  graph: GraphVersion;
  entries: Entry[];
  full: boolean;
  onReorder: (entries: Entry[]) => void;
  onAnnounce: (text: string) => void;
  onEdit: (id: number) => void;
  onDuplicate: (index: number) => void;
  onRemove: (index: number) => void;
}) {
  const list = useRef<HTMLOListElement>(null);
  const latest = useRef(entries);
  latest.current = entries;
  const [dragged, setDragged] = useState<{ id: number; offset: number }>();
  // Keyboard: the lifted row and the order to go back to on Esc.
  const [lifted, setLifted] = useState<{ id: number; original: Entry[] }>();
  const refocus = useRef<number>(undefined);
  useLayoutEffect(() => {
    if (refocus.current === undefined) return;
    list.current?.querySelector<HTMLElement>(`[data-handle="${refocus.current}"]`)?.focus();
    refocus.current = undefined;
  });

  const swap = (from: number, to: number) => {
    const next = [...latest.current];
    [next[from], next[to]] = [next[to], next[from]];
    latest.current = next;
    onReorder(next);
  };

  const startDrag = (event: ReactPointerEvent, id: number) => {
    if (event.button !== 0) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).focus();
    const startIndex = latest.current.findIndex((entry) => entry.id === id);
    let anchorY = event.clientY;
    setDragged({ id, offset: 0 });
    const move = (moved: PointerEvent) => {
      const rows = [...(list.current?.children ?? [])] as HTMLElement[];
      const index = latest.current.findIndex((entry) => entry.id === id);
      let offset = moved.clientY - anchorY;
      const below = rows[index + 1];
      const above = rows[index - 1];
      if (offset > 0 && below && offset > below.offsetHeight / 2) {
        swap(index, index + 1);
        anchorY += below.offsetHeight;
      } else if (offset < 0 && above && -offset > above.offsetHeight / 2) {
        swap(index, index - 1);
        anchorY -= above.offsetHeight;
      }
      offset = moved.clientY - anchorY;
      setDragged({ id, offset });
    };
    const end = () => {
      setDragged(undefined);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      const index = latest.current.findIndex((entry) => entry.id === id);
      if (index !== startIndex) onAnnounce(`Resa flyttad till plats ${index + 1}`);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  const onHandleKey = (event: ReactKeyboardEvent, id: number) => {
    const index = entries.findIndex((entry) => entry.id === id);
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (lifted?.id === id) {
        setLifted(undefined);
        onAnnounce(`Resa släppt på plats ${index + 1}`);
      } else {
        setLifted({ id, original: entries });
        onAnnounce(
          `Resa ${index + 1} lyft. Pil upp och ner flyttar, mellanslag släpper, Esc avbryter.`,
        );
      }
    } else if (lifted?.id === id && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      const to = index + (event.key === "ArrowUp" ? -1 : 1);
      if (to < 0 || to >= entries.length) return;
      refocus.current = id;
      swap(index, to);
      onAnnounce(`Plats ${to + 1} av ${entries.length}`);
    } else if (lifted?.id === id && event.key === "Escape") {
      event.preventDefault();
      refocus.current = id;
      onReorder(lifted.original);
      setLifted(undefined);
      onAnnounce("Flytten avbruten");
    }
  };

  return (
    <ol ref={list} className="ibp-trips" aria-label="Resor">
      {entries.map((entry, index) => {
        const number = index + 1;
        const isDragged = dragged?.id === entry.id;
        const start = kommunName(graph, entry.trip.start);
        const destination = kommunName(graph, entry.trip.destination);
        return (
          <li
            key={entry.id}
            className={[
              "ibp-trip",
              isDragged ? "ibp-trip--dragged" : "",
              lifted?.id === entry.id ? "ibp-trip--lifted" : "",
            ].join(" ")}
            style={isDragged ? { transform: `translateY(${dragged.offset}px)` } : undefined}
          >
            <button
              type="button"
              className="ibp-handle"
              data-handle={entry.id}
              aria-label={`Flytta resa ${number}`}
              aria-pressed={lifted?.id === entry.id}
              onPointerDown={(event) => startDrag(event, entry.id)}
              onKeyDown={(event) => onHandleKey(event, entry.id)}
              onBlur={() =>
                lifted?.id === entry.id && refocus.current === undefined && setLifted(undefined)
              }
            >
              <span aria-hidden="true">⠿</span>
            </button>
            <span className="ibp-number" aria-hidden="true">
              {number}
            </span>
            <span className="ibp-what">
              <span
                className="ibp-pair"
                title={entry.drawn ? undefined : `${start} → ${destination}`}
              >
                {entry.drawn ? (
                  <>
                    Slumpad ·{" "}
                    <span className="ibp-drawn-range">avstånd {rangeText(entry.drawn)}</span>
                  </>
                ) : (
                  <>
                    <span className="itinerary-start">{start}</span>
                    {" → "}
                    <span className="itinerary-destination">{destination}</span>
                  </>
                )}
              </span>
              <span className="ibp-mode">{modeText(entry.mode)}</span>
            </span>
            <span className="ibp-actions">
              <button
                type="button"
                aria-label={`Ändra resa ${number}`}
                onClick={() => onEdit(entry.id)}
              >
                <span aria-hidden="true">✎</span>
              </button>
              <button
                type="button"
                aria-label={`Dubblera resa ${number}`}
                disabled={full}
                onClick={() => onDuplicate(index)}
              >
                <span aria-hidden="true">⧉</span>
              </button>
              <button
                type="button"
                aria-label={`Ta bort resa ${number}`}
                onClick={() => onRemove(index)}
              >
                <span aria-hidden="true">✕</span>
              </button>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------------------------
// The add / edit modal and the confirm dialog

/** A modal dialog the backdrop never closes; Esc cancels. */
function Dialog({
  className,
  label,
  onCancel,
  children,
}: {
  className: string;
  label: string;
  onCancel: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`ibp-dialog ${className}`}
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      {children}
    </dialog>
  );
}

type ModalResult = {
  mode: ModeSetting;
  tab: TripChoiceTab;
  range: DistanceRange;
  count: number;
  /** Välj själv's trip. */
  trip?: Trip;
  /** A trip drawn by Slumpa om, while editing. */
  redrawn?: Trip;
};

const ID_PREFIX = "ibp";

function TripModal({
  graph,
  pairs,
  largest,
  heading,
  submitLabel,
  room,
  editing,
  initial,
  onCancel,
  onSubmit,
}: {
  graph: GraphVersion;
  pairs: TripPairs;
  largest: number;
  heading: string;
  submitLabel: string;
  /** Adding: how many trips fit, for Antal. */
  room?: number;
  /** Editing: the trip being edited. */
  editing?: Entry;
  initial: {
    mode: ModeSetting;
    thinkingTime: number;
    range: DistanceRange;
    tab: TripChoiceTab;
    start?: string;
    destination?: string;
  };
  onCancel: () => void;
  onSubmit: (result: ModalResult) => void;
}) {
  const [mode, setMode] = useState(initial.mode);
  const [thinkingTime, setThinkingTime] = useState(initial.thinkingTime);
  const [range, setRange] = useState(initial.range);
  const [tab, setTab] = useState(initial.tab);
  const [count, setCount] = useState(1);
  const [redrawn, setRedrawn] = useState<Trip>();
  const [startText, setStartText] = useState(initial.start ?? "");
  const [destinationText, setDestinationText] = useState(initial.destination ?? "");

  const start = resolveEndpoint(graph, startText);
  const destination = resolveEndpoint(graph, destinationText);
  const picked = pickedTrip(graph, start, destination);
  const problem =
    start === undefined || destination === undefined
      ? undefined
      : start === destination
        ? "Start och mål är samma kommun."
        : graph.neighbors.get(start)?.has(destination)
          ? "Start och mål är grannar. Välj en kommun längre bort."
          : undefined;
  const pickOk = picked !== undefined && problem === undefined;
  const maxCount = Math.max(1, room ?? 1);
  const showCount = room !== undefined && room > 1;
  const canSubmit = tab === "draw" || pickOk;

  const changeMode = (next: ModeSetting) => {
    setMode(next);
    if (next.kind === "timed") setThinkingTime(next.thinkingTime);
  };
  const changeRange = (next: DistanceRange) => {
    setRange(next);
    setRedrawn(undefined);
  };
  const submit = () =>
    canSubmit &&
    onSubmit({
      mode,
      tab,
      range,
      count: Math.min(count, maxCount),
      trip: tab === "pick" ? picked?.trip : undefined,
      redrawn: tab === "draw" ? redrawn : undefined,
    });

  // What Spara will do to a drawn trip, said under the range while editing.
  const editNote =
    editing === undefined
      ? undefined
      : redrawn
        ? "Ny resa slumpad. Den sparas med Spara."
        : editing.drawn === undefined
          ? "En ny resa slumpas när du sparar."
          : sameRange(editing.drawn, range)
            ? "Samma avstånd: resan behålls, bara läget ändras."
            : "Nytt avstånd: en ny resa slumpas när du sparar.";

  return (
    <Dialog className="ibp-modal" label={heading} onCancel={onCancel}>
      <form
        className="ibp-modal-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <header className="ibp-modal-header">
          <h3>{heading}</h3>
        </header>
        <div className="ibp-modal-body">
          <ModeCards mode={mode} thinkingTime={thinkingTime} onChange={changeMode} />
          {mode.kind === "timed" && (
            <ThinkingTimeField
              id="ibp-thinking-time"
              seconds={mode.thinkingTime}
              onChange={(seconds) => changeMode({ kind: "timed", thinkingTime: seconds })}
            />
          )}
          <TripChoiceTabs idPrefix={ID_PREFIX} selected={tab} onSelect={setTab} />
          <div
            id={tripChoicePanelId(ID_PREFIX, "draw")}
            role="tabpanel"
            aria-labelledby={tripChoiceTabId(ID_PREFIX, "draw")}
            className="free-play-panel"
            hidden={tab !== "draw"}
          >
            <DistanceRangeSlider range={range} largest={largest} onChange={changeRange} />
            {showCount && (
              <div className="ibp-count">
                <label htmlFor="ibp-count">
                  Antal <strong>{Math.min(count, maxCount)}</strong>
                </label>
                <input
                  id="ibp-count"
                  type="range"
                  min={1}
                  max={maxCount}
                  value={Math.min(count, maxCount)}
                  onChange={(event) => setCount(Number(event.target.value))}
                />
                <span className="ibp-count-max">{maxCount}</span>
              </div>
            )}
            {editing !== undefined ? (
              <div className="ibp-redraw">
                <button
                  type="button"
                  className="itinerary-copy"
                  onClick={() =>
                    setRedrawn(drawTrips(pairs, range, 1, Math.random, redrawn ?? editing.trip)[0])
                  }
                >
                  <span aria-hidden="true">🎲</span> Slumpa om
                </button>
                <p className="ibp-note" aria-live="polite">
                  {editNote}
                </p>
              </div>
            ) : (
              <p className="ibp-note">Start och mål visas när resan börjar.</p>
            )}
          </div>
          <div
            id={tripChoicePanelId(ID_PREFIX, "pick")}
            role="tabpanel"
            aria-labelledby={tripChoiceTabId(ID_PREFIX, "pick")}
            className="free-play-panel"
            hidden={tab !== "pick"}
          >
            <EndpointField
              id={`${ID_PREFIX}-start`}
              label="Start"
              end="start"
              text={startText}
              suggestions={endpointSuggestions(graph, startText, destination)}
              onTextChange={setStartText}
            />
            <EndpointField
              id={`${ID_PREFIX}-destination`}
              label="Mål"
              end="destination"
              text={destinationText}
              suggestions={endpointSuggestions(graph, destinationText, start)}
              onTextChange={setDestinationText}
            />
            <p className="free-play-distance" aria-live="polite">
              {picked !== undefined && problem === undefined
                ? `Avstånd ${picked.distance}`
                : problem}
            </p>
          </div>
        </div>
        <footer className="ibp-modal-footer">
          <button type="button" className="itinerary-copy" onClick={onCancel}>
            Avbryt
          </button>
          <button type="submit" className="itinerary-play" disabled={!canSubmit}>
            {submitLabel}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
