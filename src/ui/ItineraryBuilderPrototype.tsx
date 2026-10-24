// PROTOTYPE: throwaway itinerary builder variants for "Prototype the itinerary builder"
// (grehnen/akle#67). Three variants on /resplan, switchable via ?variant=A|B|C. Never merge to main.
import { useEffect, useMemo, useState } from "react";
import type { DailyTripSource } from "../daily/loadDailyTrip";
import { parseGraphVersionFiles } from "../graph/graphVersionFiles";
import { type GraphVersion, type KommunCode, kommunName } from "../graph/graphVersion";
import { shortestRouteLength } from "../graph/routes";
import {
  blockedBy,
  DistanceRangeSlider,
  drawPair,
  KommunPicker,
  MODES,
  type ModeKey,
  type Pair,
  pairsByDistance,
  ThinkingTimeField,
} from "./FreePlaySetupPrototype";
import { PrototypeSwitcher } from "./PrototypeSwitcher";
import "./FreePlaySetupPrototype.css";
import "./ItineraryBuilderPrototype.css";

const MAX_TRIPS = 20;
const MAX_TITLE = 40;

type Trip = {
  id: number;
  start: KommunCode;
  destination: KommunCode;
  /** Whether the pair came from a draw. */
  drawn: boolean;
  mode: ModeKey;
  thinkingTime: number;
};

type TripSettings = Pick<Trip, "mode" | "thinkingTime">;

let nextId = 1;

// ---------------------------------------------------------------------------------------------
// The packed `r` payload from ADR 0007, roughly: enough to show a realistic link length.

function packItinerary(ordinal: number, trips: readonly Trip[]): string {
  const bits: number[] = [];
  const write = (value: number, width: number) => {
    for (let bit = width - 1; bit >= 0; bit--) bits.push((value >> bit) & 1);
  };
  write(1, 4);
  write(ordinal, 6);
  write(trips.length, 5);
  for (const trip of trips) {
    write(Number(trip.start), 14);
    write(Number(trip.destination), 14);
    write(
      MODES.findIndex((mode) => mode.key === trip.mode),
      2,
    );
    if (trip.mode === "tidspress") write(trip.thinkingTime - 5, 6);
  }
  while (bits.length % 8) bits.push(0);
  const bytes: number[] = [];
  for (let index = 0; index < bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8).join(""), 2));
  }
  bytes.push(bytes.reduce((sum, byte) => (sum + byte) % 256, 0));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function itineraryLink(title: string, trips: readonly Trip[]): string | undefined {
  if (trips.length < 2) return undefined;
  const params = new URLSearchParams();
  if (title.trim()) params.set("namn", title.trim());
  params.set("r", packItinerary(0, trips));
  return `/resplan?${params}`;
}

// ---------------------------------------------------------------------------------------------
// Shared state

type Builder = {
  graph: GraphVersion;
  maxDistance: number;
  title: string;
  setTitle: (title: string) => void;
  trips: readonly Trip[];
  /** Adds trips at the end, or before `at`. Stops at 20 trips. */
  addPicked: (pair: Pair, settings: TripSettings, at?: number) => void;
  addDrawn: (count: number, range: [number, number], settings: TripSettings, at?: number) => void;
  update: (id: number, change: Partial<Trip>) => void;
  redraw: (id: number, range: [number, number]) => void;
  move: (id: number, by: number) => void;
  duplicate: (id: number) => void;
  remove: (id: number) => void;
  link: string | undefined;
  copy: () => void;
  copied: boolean;
};

type VariantProps = { builder: Builder };

const VARIANTS = [
  { key: "A", name: "Lista", Component: VariantList },
  { key: "B", name: "Korgen i Fri resa", Component: VariantBasket },
  { key: "C", name: "Tidslinje", Component: VariantTimeline },
] as const;

/** Loads the newest graph version directly, so the prototype works before launch day too. */
export function ItineraryBuilderPrototypeLoader({ source }: { source: DailyTripSource }) {
  const [graph, setGraph] = useState<GraphVersion>();
  useEffect(() => {
    source
      .graphVersions()
      .then((versions) => {
        const newest = [...versions].sort((a, b) => b.startsAtTrip - a.startsAtTrip)[0];
        return source.graphVersionFiles(newest.id);
      })
      .then((files) => setGraph(parseGraphVersionFiles(files)))
      .catch(console.error);
  }, [source]);
  return graph ? <ItineraryBuilderPrototype graph={graph} /> : <p>Laddar…</p>;
}

function ItineraryBuilderPrototype({ graph }: { graph: GraphVersion }) {
  const [variant, setVariant] = useState(
    () => new URLSearchParams(window.location.search).get("variant") ?? "A",
  );
  const pairs = useMemo(() => pairsByDistance(graph), [graph]);
  const maxDistance = Math.max(...pairs.keys());
  const [title, setTitle] = useState("");
  const [copied, setCopied] = useState(false);
  // Timeline starts with two drawn trips so the itinerary is valid from the first frame.
  const [trips, setTrips] = useState<readonly Trip[]>(() =>
    variant === "C" ? drawTrips(pairs, 2, [3, 8], { mode: "standard", thinkingTime: 10 }) : [],
  );

  const change = (next: (current: readonly Trip[]) => readonly Trip[]) => {
    setCopied(false);
    setTrips((current) => next(current).slice(0, MAX_TRIPS));
  };
  const insert = (added: Trip[], at?: number) =>
    change((current) => {
      const index = at ?? current.length;
      return [...current.slice(0, index), ...added, ...current.slice(index)];
    });
  const link = itineraryLink(title, trips);

  const builder: Builder = {
    graph,
    maxDistance,
    title,
    setTitle: (next) => {
      setCopied(false);
      setTitle(next.slice(0, MAX_TITLE));
    },
    trips,
    addPicked: ([start, destination], settings, at) =>
      insert([{ id: nextId++, start, destination, drawn: false, ...settings }], at),
    addDrawn: (count, range, settings, at) =>
      insert(drawTrips(pairs, Math.min(count, MAX_TRIPS - trips.length), range, settings), at),
    update: (id, patch) =>
      change((current) => current.map((trip) => (trip.id === id ? { ...trip, ...patch } : trip))),
    redraw: (id, range) =>
      change((current) =>
        current.map((trip) => {
          if (trip.id !== id) return trip;
          const [start, destination] = drawPair(pairs, range, [trip.start, trip.destination]);
          return { ...trip, start, destination, drawn: true };
        }),
      ),
    move: (id, by) =>
      change((current) => {
        const from = current.findIndex((trip) => trip.id === id);
        const to = from + by;
        if (to < 0 || to >= current.length) return current;
        const next = [...current];
        [next[from], next[to]] = [next[to], next[from]];
        return next;
      }),
    duplicate: (id) =>
      change((current) => {
        const index = current.findIndex((trip) => trip.id === id);
        return [
          ...current.slice(0, index + 1),
          { ...current[index], id: nextId++ },
          ...current.slice(index + 1),
        ];
      }),
    remove: (id) => change((current) => current.filter((trip) => trip.id !== id)),
    link,
    copy: () => {
      if (!link) return;
      void navigator.clipboard?.writeText(window.location.origin + link).catch(() => {});
      setCopied(true);
    },
    copied,
  };

  const changeVariant = (key: string) => {
    setVariant(key);
    const url = new URL(window.location.href);
    url.searchParams.set("variant", key);
    window.history.replaceState(null, "", url);
  };

  const Current = (VARIANTS.find((entry) => entry.key === variant) ?? VARIANTS[0]).Component;
  return (
    <>
      <Current builder={builder} />
      <details className="fp-state">
        <summary>Prototyp: tillstånd</summary>
        <pre>
          {JSON.stringify(
            {
              title,
              trips: trips.map((trip) => ({
                ...trip,
                startName: kommunName(graph, trip.start),
                destinationName: kommunName(graph, trip.destination),
                distance: shortestRouteLength(graph, trip.start, trip.destination),
              })),
              link: link ?? null,
              linkLength: link ? window.location.origin.length + link.length : null,
              copied,
            },
            null,
            2,
          )}
        </pre>
      </details>
      <PrototypeSwitcher
        variants={VARIANTS.map(({ key, name }) => ({ key, name }))}
        current={variant}
        onChange={changeVariant}
      />
    </>
  );
}

/** Draws `count` trips; each skips the pair drawn just before it. */
function drawTrips(
  pairs: Map<number, Pair[]>,
  count: number,
  range: [number, number],
  settings: TripSettings,
): Trip[] {
  const drawn: Trip[] = [];
  let previous: Pair | undefined;
  for (let index = 0; index < count; index++) {
    const [start, destination] = drawPair(pairs, range, previous);
    previous = [start, destination];
    drawn.push({ id: nextId++, start, destination, drawn: true, ...settings });
  }
  return drawn;
}

// ---------------------------------------------------------------------------------------------
// Shared widgets (not layout)

function modeLabel(trip: TripSettings): string {
  const name = MODES.find((mode) => mode.key === trip.mode)?.name ?? trip.mode;
  return trip.mode === "tidspress" ? `${name} ${trip.thinkingTime} s` : name;
}

function ModeSelect({
  value,
  onChange,
}: {
  value: TripSettings;
  onChange: (change: Partial<TripSettings>) => void;
}) {
  return (
    <span className="ib-mode-select">
      <select
        aria-label="Läge"
        value={value.mode}
        onChange={(event) => onChange({ mode: event.target.value as ModeKey })}
      >
        {MODES.map((mode) => (
          <option key={mode.key} value={mode.key}>
            {mode.name}
          </option>
        ))}
      </select>
      {value.mode === "tidspress" && (
        <select
          aria-label="Betänketid"
          value={value.thinkingTime}
          onChange={(event) => onChange({ thinkingTime: Number(event.target.value) })}
        >
          {[5, 10, 15, 20, 30, 45, 60].map((seconds) => (
            <option key={seconds} value={seconds}>
              {seconds} s
            </option>
          ))}
        </select>
      )}
    </span>
  );
}

function ModeCards({
  value,
  onChange,
}: {
  value: TripSettings;
  onChange: (change: Partial<TripSettings>) => void;
}) {
  return (
    <div className="fp-b__cards" role="radiogroup" aria-label="Läge">
      {MODES.map((entry) => (
        <div
          key={entry.key}
          className="fp-b__card"
          role="radio"
          tabIndex={0}
          aria-checked={entry.key === value.mode}
          onClick={() => onChange({ mode: entry.key })}
          onKeyDown={(event) => event.key === " " && onChange({ mode: entry.key })}
        >
          <strong>{entry.name}</strong>
          <span>{entry.blurb}</span>
          {entry.key === "tidspress" && value.mode === "tidspress" && (
            <span onClick={(event) => event.stopPropagation()}>
              <ThinkingTimeField
                value={value.thinkingTime}
                onChange={(thinkingTime) => onChange({ thinkingTime })}
              />
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function TitleField({ builder, className = "" }: { builder: Builder; className?: string }) {
  return (
    <label className={`ib-title ${className}`}>
      <span>Namn (valfritt)</span>
      <input
        value={builder.title}
        maxLength={MAX_TITLE}
        placeholder="Till exempel: Fredagsresan"
        onChange={(event) => builder.setTitle(event.target.value)}
      />
      <small>
        {builder.title.length}/{MAX_TITLE}
      </small>
    </label>
  );
}

function CopyLink({ builder }: { builder: Builder }) {
  const count = builder.trips.length;
  return (
    <div className="ib-copy">
      <span className="fp-muted">
        {count} av {MAX_TRIPS} resor{count < 2 && " · minst 2"}
      </span>
      <button type="button" className="fp-primary" disabled={!builder.link} onClick={builder.copy}>
        {builder.copied ? "Länken kopierad ✓" : "Kopiera länk"}
      </button>
    </div>
  );
}

function RowActions({ builder, trip, index }: { builder: Builder; trip: Trip; index: number }) {
  const full = builder.trips.length >= MAX_TRIPS;
  return (
    <span className="ib-actions">
      <button
        type="button"
        className="fp-ghost"
        aria-label="Flytta upp"
        disabled={index === 0}
        onClick={() => builder.move(trip.id, -1)}
      >
        ↑
      </button>
      <button
        type="button"
        className="fp-ghost"
        aria-label="Flytta ner"
        disabled={index === builder.trips.length - 1}
        onClick={() => builder.move(trip.id, 1)}
      >
        ↓
      </button>
      <button
        type="button"
        className="fp-ghost"
        aria-label="Kopiera resan"
        disabled={full}
        onClick={() => builder.duplicate(trip.id)}
      >
        ⧉
      </button>
      <button
        type="button"
        className="fp-ghost"
        aria-label="Ta bort"
        onClick={() => builder.remove(trip.id)}
      >
        ✕
      </button>
    </span>
  );
}

/** Start and destination picked by hand, with the other end and its neighbors disabled. */
function PickPair({
  graph,
  actionLabel,
  disabled,
  onPick,
}: {
  graph: GraphVersion;
  actionLabel: string;
  disabled?: boolean;
  onPick: (pair: Pair) => void;
}) {
  const [start, setStart] = useState<KommunCode>();
  const [destination, setDestination] = useState<KommunCode>();
  const valid = Boolean(start && destination && !blockedBy(graph, start)(destination));
  return (
    <>
      <KommunPicker
        graph={graph}
        label="Start"
        className="fp-picker--start"
        value={start}
        onChange={setStart}
        blocked={blockedBy(graph, destination)}
      />
      <KommunPicker
        graph={graph}
        label="Mål"
        className="fp-picker--destination"
        value={destination}
        onChange={setDestination}
        blocked={blockedBy(graph, start)}
      />
      {valid && start && destination && (
        <p className="fp-muted">Avstånd {shortestRouteLength(graph, start, destination)}</p>
      )}
      <button
        type="button"
        className="fp-primary"
        disabled={!valid || disabled}
        onClick={() => {
          if (!start || !destination) return;
          onPick([start, destination]);
          setStart(undefined);
          setDestination(undefined);
        }}
      >
        {actionLabel}
      </button>
    </>
  );
}

function Tabs({
  tab,
  onChange,
}: {
  tab: "draw" | "pick";
  onChange: (tab: "draw" | "pick") => void;
}) {
  return (
    <div className="fp-b__tabs" role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={tab === "draw"}
        onClick={() => onChange("draw")}
      >
        Slumpa
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === "pick"}
        onClick={() => onChange("pick")}
      >
        Välj själv
      </button>
    </div>
  );
}

function Stepper({
  value,
  min,
  max,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  label: string;
}) {
  return (
    <span className="fp-stepper">
      <button
        type="button"
        className="fp-ghost"
        aria-label={`Färre ${label}`}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      <output>{value}</output>
      <button
        type="button"
        className="fp-ghost"
        aria-label={`Fler ${label}`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------------------------
// A: a dedicated /resplan page; trips are rows in an editable list, added from a panel below.
// Drawn trips hide their endpoints until revealed per row.

function VariantList({ builder }: VariantProps) {
  const { graph, trips } = builder;
  const [settings, setSettings] = useState<TripSettings>({ mode: "standard", thinkingTime: 10 });
  const [tab, setTab] = useState<"draw" | "pick">("draw");
  const [range, setRange] = useState<[number, number]>([3, 8]);
  const [count, setCount] = useState(5);
  const [revealed, setRevealed] = useState<ReadonlySet<number>>(new Set());
  const room = MAX_TRIPS - trips.length;

  return (
    <section className="ib-a" aria-labelledby="ib-a-heading">
      <p className="trip-number">Resplan</p>
      <h2 id="ib-a-heading">Bygg en resplan</h2>
      <TitleField builder={builder} />

      {trips.length === 0 ? (
        <p className="fp-muted ib-a__empty">Inga resor än. Lägg till minst två nedan.</p>
      ) : (
        <ol className="ib-a__list">
          {trips.map((trip, index) => {
            const hidden = trip.drawn && !revealed.has(trip.id);
            return (
              <li key={trip.id} className="ib-a__row">
                <span className="ib-a__index">{index + 1}</span>
                <span className="ib-a__pair">
                  {hidden ? (
                    <>
                      <span>
                        🎲 Slumpad · avstånd{" "}
                        {shortestRouteLength(graph, trip.start, trip.destination)}
                      </span>
                      <button
                        type="button"
                        className="ib-link"
                        onClick={() => setRevealed(new Set([...revealed, trip.id]))}
                      >
                        Visa
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="ib-start">{kommunName(graph, trip.start)}</span>
                      {" → "}
                      <span className="ib-destination">{kommunName(graph, trip.destination)}</span>
                    </>
                  )}
                </span>
                <ModeSelect value={trip} onChange={(change) => builder.update(trip.id, change)} />
                <RowActions builder={builder} trip={trip} index={index} />
              </li>
            );
          })}
        </ol>
      )}

      <fieldset className="ib-a__add" disabled={room === 0}>
        <legend>Lägg till resor{room === 0 && " (fullt)"}</legend>
        <p className="fp-muted ib-a__hint">Läge för nya resor</p>
        <ModeSelect
          value={settings}
          onChange={(change) => setSettings({ ...settings, ...change })}
        />
        <Tabs tab={tab} onChange={setTab} />
        {tab === "draw" ? (
          <div className="fp-b__panel fp-d__panel" role="tabpanel">
            <DistanceRangeSlider
              min={range[0]}
              max={range[1]}
              limit={builder.maxDistance}
              onChange={setRange}
            />
            <p className="ib-a__count">
              Antal{" "}
              <Stepper
                value={Math.min(count, Math.max(room, 1))}
                min={1}
                max={Math.max(room, 1)}
                onChange={setCount}
                label="resor"
              />
            </p>
            <button
              type="button"
              className="fp-primary"
              onClick={() => builder.addDrawn(Math.min(count, room), range, settings)}
            >
              🎲 Lägg till {Math.min(count, room)} slumpade
            </button>
          </div>
        ) : (
          <div className="fp-b__panel fp-d__panel" role="tabpanel">
            <PickPair
              graph={graph}
              actionLabel="Lägg till"
              disabled={room === 0}
              onPick={(pair) => builder.addPicked(pair, settings)}
            />
          </div>
        )}
      </fieldset>

      <div className="ib-sticky">
        <CopyLink builder={builder} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// B: no separate page. The free-play setup screen gets "Lägg i resplanen" beside Res and
// Slumpa resa; the itinerary collects in a basket at the bottom. Drawn trips stay hidden.

function VariantBasket({ builder }: VariantProps) {
  const { graph, trips } = builder;
  const [settings, setSettings] = useState<TripSettings>({ mode: "standard", thinkingTime: 10 });
  const [tab, setTab] = useState<"draw" | "pick">("draw");
  const [range, setRange] = useState<[number, number]>([3, 8]);
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<string>();
  const full = trips.length >= MAX_TRIPS;

  const flash = (text: string) => {
    setAdded(text);
    setTimeout(() => setAdded(undefined), 1500);
  };

  return (
    <section className="fp-b fp-d ib-b" aria-labelledby="ib-b-heading">
      <h2 id="ib-b-heading">Fri resa</h2>

      <h3 className="section-heading fp-b__mode-heading">Läge</h3>
      <ModeCards value={settings} onChange={(change) => setSettings({ ...settings, ...change })} />

      <Tabs tab={tab} onChange={setTab} />
      {tab === "draw" ? (
        <div className="fp-b__panel fp-d__panel" role="tabpanel">
          <DistanceRangeSlider
            min={range[0]}
            max={range[1]}
            limit={builder.maxDistance}
            onChange={setRange}
          />
          <button type="button" className="fp-primary fp-d__dice" disabled>
            <span aria-hidden="true">🎲</span> Slumpa resa
          </button>
          <button
            type="button"
            className="fp-ghost ib-b__add"
            disabled={full}
            onClick={() => {
              builder.addDrawn(1, range, settings);
              flash("Slumpad resa tillagd");
            }}
          >
            + Lägg en slumpad resa i resplanen
          </button>
          <p className="fp-muted">Start och mål visas när resan börjar.</p>
        </div>
      ) : (
        <div className="fp-b__panel fp-d__panel" role="tabpanel">
          <PickPair
            graph={graph}
            actionLabel="+ Lägg i resplanen"
            disabled={full}
            onPick={(pair) => {
              builder.addPicked(pair, settings);
              flash(`${kommunName(graph, pair[0])} → ${kommunName(graph, pair[1])} tillagd`);
            }}
          />
          <p className="fp-muted">(Res-knappen finns kvar som i Fri resa.)</p>
        </div>
      )}

      <div className={`ib-b__basket ${open ? "ib-b__basket--open" : ""}`}>
        <button
          type="button"
          className="ib-b__handle"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <strong>Resplan</strong>
          <span>{added ?? `${trips.length} ${trips.length === 1 ? "resa" : "resor"}`}</span>
          <span aria-hidden="true">{open ? "▾" : "▴"}</span>
        </button>
        {open && (
          <div className="ib-b__sheet">
            <TitleField builder={builder} />
            {trips.length === 0 ? (
              <p className="fp-muted">Tom. Lägg till resor ovan.</p>
            ) : (
              <ol className="ib-b__list">
                {trips.map((trip, index) => (
                  <li key={trip.id}>
                    <span className="ib-b__trip">
                      <strong>Resa {index + 1}</strong>
                      <span>
                        {trip.drawn
                          ? `🎲 Slumpad · avstånd ${shortestRouteLength(graph, trip.start, trip.destination)}`
                          : `${kommunName(graph, trip.start)} → ${kommunName(graph, trip.destination)}`}
                      </span>
                      <span className="fp-muted">{modeLabel(trip)}</span>
                    </span>
                    <RowActions builder={builder} trip={trip} index={index} />
                  </li>
                ))}
              </ol>
            )}
            <CopyLink builder={builder} />
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// C: the itinerary as a route of trip cards, edited in place. Starts with two drawn trips;
// every pair is shown as road signs; "+" between cards inserts a trip there.

function VariantTimeline({ builder }: VariantProps) {
  const { graph, trips } = builder;
  const [editing, setEditing] = useState<number>();
  const [range, setRange] = useState<[number, number]>([3, 8]);
  const full = trips.length >= MAX_TRIPS;

  const insertAt = (index: number) => {
    const before = trips[index - 1] ?? trips[index];
    builder.addDrawn(1, range, before ?? { mode: "standard", thinkingTime: 10 }, index);
  };

  return (
    <section className="ib-c" aria-labelledby="ib-c-heading">
      <p className="trip-number">Resplan</p>
      <input
        id="ib-c-heading"
        className="ib-c__title"
        aria-label="Resplanens namn"
        value={builder.title}
        maxLength={MAX_TITLE}
        placeholder="Namnlös resplan"
        onChange={(event) => builder.setTitle(event.target.value)}
      />

      <ol className="ib-c__route">
        {trips.map((trip, index) => (
          <li key={trip.id}>
            <InsertPoint disabled={full} onInsert={() => insertAt(index)} />
            <article className="ib-c__card" aria-expanded={editing === trip.id}>
              <button
                type="button"
                className="ib-c__summary"
                onClick={() => setEditing(editing === trip.id ? undefined : trip.id)}
              >
                <span className="ib-c__number">{index + 1}</span>
                <span className="fp-signs">
                  <strong className="sign sign--start">{kommunName(graph, trip.start)}</strong>
                  <strong className="sign sign--destination">
                    {kommunName(graph, trip.destination)}
                  </strong>
                </span>
                <span className="fp-muted">
                  {modeLabel(trip)} · avstånd{" "}
                  {shortestRouteLength(graph, trip.start, trip.destination)}
                </span>
              </button>
              {editing === trip.id && (
                <TimelineEditor
                  builder={builder}
                  trip={trip}
                  index={index}
                  range={range}
                  setRange={setRange}
                />
              )}
            </article>
          </li>
        ))}
        <li>
          <InsertPoint disabled={full} onInsert={() => insertAt(trips.length)} label="Ny resa" />
        </li>
      </ol>

      <div className="ib-sticky">
        <CopyLink builder={builder} />
      </div>
    </section>
  );
}

function InsertPoint({
  disabled,
  onInsert,
  label,
}: {
  disabled: boolean;
  onInsert: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      className={`ib-c__insert ${label ? "ib-c__insert--end" : ""}`}
      disabled={disabled}
      aria-label={label ?? "Lägg in en resa här"}
      onClick={onInsert}
    >
      + {label}
    </button>
  );
}

function TimelineEditor({
  builder,
  trip,
  index,
  range,
  setRange,
}: {
  builder: Builder;
  trip: Trip;
  index: number;
  range: [number, number];
  setRange: (range: [number, number]) => void;
}) {
  const [picking, setPicking] = useState(false);
  return (
    <div className="ib-c__editor">
      <ModeCards value={trip} onChange={(change) => builder.update(trip.id, change)} />
      {picking ? (
        <div className="fp-b__panel fp-d__panel">
          <PickPair
            graph={builder.graph}
            actionLabel="Byt till denna resa"
            onPick={([start, destination]) => {
              builder.update(trip.id, { start, destination, drawn: false });
              setPicking(false);
            }}
          />
          <button type="button" className="ib-link" onClick={() => setPicking(false)}>
            Avbryt
          </button>
        </div>
      ) : (
        <div className="fp-b__panel fp-d__panel">
          <DistanceRangeSlider
            min={range[0]}
            max={range[1]}
            limit={builder.maxDistance}
            onChange={setRange}
          />
          <span className="ib-c__row">
            <button
              type="button"
              className="fp-primary"
              onClick={() => builder.redraw(trip.id, range)}
            >
              🎲 Slumpa om
            </button>
            <button type="button" className="fp-ghost" onClick={() => setPicking(true)}>
              Välj själv
            </button>
          </span>
        </div>
      )}
      <RowActions builder={builder} trip={trip} index={index} />
    </div>
  );
}
