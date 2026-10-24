// PROTOTYPE: throwaway free-play setup screen variants for "Prototype the free-play setup screen"
// (grehnen/akle#62). Three variants on /fri, switchable via ?variant=A|B|C. Never merge to main.
import { useEffect, useMemo, useState } from "react";
import type { DailyTripSource } from "../daily/loadDailyTrip";
import { foldKommunName } from "../engine/kommunNames";
import { parseGraphVersionFiles } from "../graph/graphVersionFiles";
import { type GraphVersion, type KommunCode, kommunName } from "../graph/graphVersion";
import { shortestRouteLength, shortestRouteLengthsFrom } from "../graph/routes";
import { SatelliteMap } from "../map/SatelliteMap";
import { PrototypeSwitcher } from "./PrototypeSwitcher";
import "./FreePlaySetupPrototype.css";

export type ModeKey = "standard" | "obegransad" | "tidspress" | "tidtagning";

export const MODES: readonly { key: ModeKey; name: string; blurb: string }[] = [
  {
    key: "standard",
    name: "Standard",
    blurb: "Som dagens resa: gissningarna räcker till avståndet och lite till.",
  },
  {
    key: "obegransad",
    name: "Obegränsad",
    blurb: "Gissa hur många gånger du vill. Ge upp när du vill.",
  },
  { key: "tidspress", name: "Tidspress", blurb: "Varje gissning måste göras inom betänketiden." },
  {
    key: "tidtagning",
    name: "Tidtagning",
    blurb: "Tiden tas. Vid lika poäng vinner den snabbaste.",
  },
];

type Setup = {
  start?: KommunCode;
  destination?: KommunCode;
  /** Whether the current pair came from a draw. */
  drawn: boolean;
  range: [number, number];
  mode: ModeKey;
  thinkingTime: number;
};

const INITIAL_SETUP: Setup = { drawn: false, range: [3, 8], mode: "standard", thinkingTime: 10 };

export type Pair = [KommunCode, KommunCode];

export function pairsByDistance(graph: GraphVersion): Map<number, Pair[]> {
  const byDistance = new Map<number, Pair[]>();
  for (const from of graph.kommuner.keys()) {
    for (const [to, distance] of shortestRouteLengthsFrom(graph, from)) {
      if (to <= from || distance < 1) continue;
      const list = byDistance.get(distance) ?? [];
      list.push([from, to]);
      byDistance.set(distance, list);
    }
  }
  return byDistance;
}

export function drawPair(
  pairs: Map<number, Pair[]>,
  [min, max]: [number, number],
  previous?: Pair,
): Pair {
  const distances = [...pairs.keys()].filter((distance) => distance >= min && distance <= max);
  const distance = distances[Math.floor(Math.random() * distances.length)];
  const candidates = (pairs.get(distance) ?? []).filter(
    ([a, b]) =>
      !previous ||
      !((a === previous[0] && b === previous[1]) || (a === previous[1] && b === previous[0])),
  );
  const [a, b] = candidates[Math.floor(Math.random() * candidates.length)];
  return Math.random() < 0.5 ? [a, b] : [b, a];
}

type PairProblem = "same" | "neighbors";

function pairProblem(
  graph: GraphVersion,
  start: KommunCode,
  destination: KommunCode,
): PairProblem | undefined {
  if (start === destination) return "same";
  if (graph.neighbors.get(start)?.has(destination)) return "neighbors";
  return undefined;
}

const PROBLEM_TEXT: Record<PairProblem, string> = {
  same: "Start och mål är samma kommun.",
  neighbors: "Start och mål är grannar. Välj en kommun längre bort.",
};

function freePlayLink(graph: GraphVersion, setup: Setup): string | undefined {
  if (!setup.start || !setup.destination) return undefined;
  const params = new URLSearchParams({
    fran: setup.start,
    till: setup.destination,
    v: graph.id,
    lage: setup.mode,
  });
  if (setup.mode === "tidspress") params.set("tid", String(setup.thinkingTime));
  return `/fri?${params}`;
}

type VariantProps = {
  graph: GraphVersion;
  setup: Setup;
  update: (change: Partial<Setup>) => void;
  maxDistance: number;
  draw: () => void;
  /** Draws a pair and starts the trip at once, without showing the pair first. */
  drawAndStart: () => void;
  start: () => void;
  problem: PairProblem | undefined;
  distance: number | undefined;
};

const VARIANTS = [
  { key: "A", name: "Formulär", Component: VariantForm },
  { key: "B", name: "Två vägar", Component: VariantTwoPaths },
  { key: "C", name: "Skylten", Component: VariantSigns },
  { key: "D", name: "Läge först, slumpa startar", Component: VariantModeFirst },
] as const;

/** Loads the newest graph version directly, so the prototype works before launch day too. */
export function FreePlaySetupPrototypeLoader({ source }: { source: DailyTripSource }) {
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
  return graph ? <FreePlaySetupPrototype graph={graph} /> : <p>Laddar…</p>;
}

export function FreePlaySetupPrototype({ graph }: { graph: GraphVersion }) {
  const [variant, setVariant] = useState(
    () => new URLSearchParams(window.location.search).get("variant") ?? "A",
  );
  const [setup, setSetup] = useState<Setup>(INITIAL_SETUP);
  const [startedLink, setStartedLink] = useState<string>();
  const pairs = useMemo(() => pairsByDistance(graph), [graph]);
  const maxDistance = Math.max(...pairs.keys());

  const update = (change: Partial<Setup>) => {
    setStartedLink(undefined);
    setSetup((current) => ({ ...current, ...change }));
  };
  const draw = () => {
    const previous: Pair | undefined =
      setup.start && setup.destination ? [setup.start, setup.destination] : undefined;
    const [start, destination] = drawPair(pairs, setup.range, previous);
    update({ start, destination, drawn: true });
  };
  const problem =
    setup.start && setup.destination
      ? pairProblem(graph, setup.start, setup.destination)
      : undefined;
  const distance =
    setup.start && setup.destination && !problem
      ? shortestRouteLength(graph, setup.start, setup.destination)
      : undefined;
  const link = freePlayLink(graph, setup);

  const changeVariant = (key: string) => {
    setVariant(key);
    const url = new URL(window.location.href);
    url.searchParams.set("variant", key);
    window.history.replaceState(null, "", url);
  };

  const Current = (VARIANTS.find((entry) => entry.key === variant) ?? VARIANTS[0]).Component;
  return (
    <>
      <Current
        graph={graph}
        setup={setup}
        update={update}
        maxDistance={maxDistance}
        draw={draw}
        drawAndStart={() => {
          const previous: Pair | undefined =
            setup.start && setup.destination ? [setup.start, setup.destination] : undefined;
          const [start, destination] = drawPair(pairs, setup.range, previous);
          const next = { ...setup, start, destination, drawn: true };
          setSetup(next);
          setStartedLink(freePlayLink(graph, next));
        }}
        start={() => link && !problem && setStartedLink(link)}
        problem={problem}
        distance={distance}
      />
      <details className="fp-state">
        <summary>Prototyp: tillstånd</summary>
        <pre>
          {JSON.stringify(
            {
              ...setup,
              startName: setup.start && kommunName(graph, setup.start),
              destinationName: setup.destination && kommunName(graph, setup.destination),
              distance,
              problem,
              maxDistance,
              link,
              started: startedLink ?? null,
            },
            null,
            2,
          )}
        </pre>
      </details>
      {startedLink && (
        <p role="status" className="fp-started">
          Skulle öppna <code>{startedLink}</code>
        </p>
      )}
      <PrototypeSwitcher
        variants={VARIANTS.map(({ key, name }) => ({ key, name }))}
        current={variant}
        onChange={changeVariant}
      />
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Shared widgets (not layout)

type KommunPickerProps = {
  graph: GraphVersion;
  label: string;
  value: KommunCode | undefined;
  onChange: (code: KommunCode | undefined) => void;
  /** Why a kommun can't be picked here, or undefined when it can. */
  blocked?: (code: KommunCode) => string | undefined;
  /** Leave blocked kommuner out of the list instead of showing them disabled. */
  hideBlocked?: boolean;
  autoFocus?: boolean;
  onDone?: () => void;
  className?: string;
};

export function KommunPicker({
  graph,
  label,
  value,
  onChange,
  blocked,
  hideBlocked = false,
  autoFocus,
  onDone,
  className = "",
}: KommunPickerProps) {
  const [text, setText] = useState(value ? kommunName(graph, value) : "");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setText(value ? kommunName(graph, value) : "");
  }, [graph, value]);

  const folded = foldKommunName(text);
  const suggestions = useMemo(() => {
    if (folded === "" || (value && kommunName(graph, value) === text)) return [];
    const all = [...graph.kommuner.values()]
      .map((kommun) => ({
        ...kommun,
        folded: foldKommunName(kommun.name),
        reason: blocked?.(kommun.code),
      }))
      .filter((kommun) => kommun.folded.includes(folded))
      .filter((kommun) => !(hideBlocked && kommun.reason));
    all.sort(
      (a, b) =>
        Number(!a.folded.startsWith(folded)) - Number(!b.folded.startsWith(folded)) ||
        a.name.localeCompare(b.name, "sv"),
    );
    return all.slice(0, 7);
  }, [graph, folded, text, value, blocked, hideBlocked]);

  const choose = (code: KommunCode) => {
    onChange(code);
    setOpen(false);
    onDone?.();
  };

  return (
    <label className={`fp-picker ${className}`}>
      <span className="fp-picker__label">{label}</span>
      <span className="fp-picker__field">
        <input
          value={text}
          autoFocus={autoFocus}
          placeholder="Skriv en kommun"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setText(event.target.value);
            setOpen(true);
            if (value) onChange(undefined);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              const first = suggestions.find((kommun) => !kommun.reason);
              if (first) choose(first.code);
            }
            if (event.key === "Escape") onDone?.();
          }}
        />
        {open && suggestions.length > 0 && (
          <ul className="fp-picker__list">
            {suggestions.map((kommun) => (
              <li key={kommun.code}>
                <button
                  type="button"
                  disabled={kommun.reason !== undefined}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(kommun.code)}
                >
                  <span>{kommun.name}</span>
                  {kommun.reason && <span className="fp-picker__reason">{kommun.reason}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </span>
    </label>
  );
}

export function blockedBy(graph: GraphVersion, other: KommunCode | undefined) {
  return (code: KommunCode) => {
    if (!other) return undefined;
    if (code === other) return "samma";
    if (graph.neighbors.get(other)?.has(code)) return "granne";
    return undefined;
  };
}

export function ThinkingTimeField({
  value,
  onChange,
}: {
  value: number;
  onChange: (seconds: number) => void;
}) {
  return (
    <label className="fp-thinking">
      <span>Betänketid</span>
      <input
        type="range"
        min={5}
        max={60}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <output>{value} s</output>
    </label>
  );
}

function TripSigns({ graph, setup }: { graph: GraphVersion; setup: Setup }) {
  if (!setup.start || !setup.destination) return null;
  return (
    <p className="fp-signs">
      <strong className="sign sign--start">{kommunName(graph, setup.start)}</strong>
      <strong className="sign sign--destination">{kommunName(graph, setup.destination)}</strong>
    </p>
  );
}

// ---------------------------------------------------------------------------------------------
// A: one plain form, every choice visible at once

function VariantForm({
  graph,
  setup,
  update,
  maxDistance,
  draw,
  start,
  problem,
  distance,
}: VariantProps) {
  const mode = MODES.find((entry) => entry.key === setup.mode) ?? MODES[0];
  const [min, max] = setup.range;
  return (
    <section className="fp-a" aria-labelledby="fp-a-heading">
      <p className="trip-number">Fri resa</p>
      <h2 id="fp-a-heading">Välj en resa</h2>

      <div className="fp-a__endpoints">
        <KommunPicker
          graph={graph}
          label="Från"
          className="fp-picker--start"
          value={setup.start}
          onChange={(code) => update({ start: code, drawn: false })}
        />
        <button
          type="button"
          className="fp-ghost fp-a__swap"
          aria-label="Byt plats på start och mål"
          onClick={() => update({ start: setup.destination, destination: setup.start })}
        >
          ⇅
        </button>
        <KommunPicker
          graph={graph}
          label="Till"
          className="fp-picker--destination"
          value={setup.destination}
          onChange={(code) => update({ destination: code, drawn: false })}
        />
      </div>
      <p role="alert" className="fp-problem">
        {problem && PROBLEM_TEXT[problem]}
      </p>
      {distance !== undefined && (
        <p className="fp-muted">
          Avstånd {distance} {setup.drawn && "· slumpad"}
        </p>
      )}

      <fieldset className="fp-a__group">
        <legend>Eller slumpa</legend>
        <div className="fp-a__draw">
          <label>
            Avstånd
            <input
              type="number"
              min={1}
              max={max}
              value={min}
              onChange={(event) => update({ range: [Number(event.target.value), max] })}
            />
          </label>
          <span aria-hidden="true">–</span>
          <label>
            <span className="visually-hidden">Högst</span>
            <input
              type="number"
              min={min}
              max={maxDistance}
              value={max}
              onChange={(event) => update({ range: [min, Number(event.target.value)] })}
            />
          </label>
          <button type="button" className="fp-ghost" onClick={draw}>
            🎲 Slumpa
          </button>
        </div>
      </fieldset>

      <fieldset className="fp-a__group">
        <legend>Läge</legend>
        <div className="fp-segmented" role="radiogroup" aria-label="Läge">
          {MODES.map((entry) => (
            <button
              key={entry.key}
              type="button"
              role="radio"
              aria-checked={entry.key === setup.mode}
              onClick={() => update({ mode: entry.key })}
            >
              {entry.name}
            </button>
          ))}
        </div>
        <p className="fp-muted">{mode.blurb}</p>
        {setup.mode === "tidspress" && (
          <ThinkingTimeField
            value={setup.thinkingTime}
            onChange={(thinkingTime) => update({ thinkingTime })}
          />
        )}
      </fieldset>

      <button
        type="button"
        className="fp-primary"
        disabled={distance === undefined}
        onClick={start}
      >
        Res
      </button>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// B: pick or draw as two tabs, modes as cards, a sticky summary bar

function VariantTwoPaths({
  graph,
  setup,
  update,
  maxDistance,
  draw,
  start,
  problem,
  distance,
}: VariantProps) {
  const [tab, setTab] = useState<"pick" | "draw">(setup.drawn ? "draw" : "pick");
  const [min, max] = setup.range;
  const startName = setup.start && kommunName(graph, setup.start);
  return (
    <section className="fp-b" aria-labelledby="fp-b-heading">
      <h2 id="fp-b-heading">Fri resa</h2>

      <div className="fp-b__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "pick"}
          onClick={() => setTab("pick")}
        >
          Välj själv
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "draw"}
          onClick={() => setTab("draw")}
        >
          Slumpa
        </button>
      </div>

      {tab === "pick" ? (
        <div className="fp-b__panel" role="tabpanel">
          <KommunPicker
            graph={graph}
            label="Start"
            className="fp-picker--start"
            value={setup.drawn ? undefined : setup.start}
            onChange={(code) => update({ start: code, drawn: false })}
            blocked={blockedBy(graph, setup.drawn ? undefined : setup.destination)}
            hideBlocked
          />
          <KommunPicker
            graph={graph}
            label="Mål"
            className="fp-picker--destination"
            value={setup.drawn ? undefined : setup.destination}
            onChange={(code) => update({ destination: code, drawn: false })}
            blocked={blockedBy(graph, setup.drawn ? undefined : setup.start)}
            hideBlocked
          />
          {startName && !setup.drawn && (
            <p className="fp-muted">{startName} och dess grannar visas inte bland målen.</p>
          )}
        </div>
      ) : (
        <div className="fp-b__panel fp-b__panel--draw" role="tabpanel">
          <div className="fp-b__range">
            <p>
              Avstånd <strong>{min === max ? min : `${min}–${max}`}</strong>
            </p>
            <label>
              <span>Minst</span>
              <input
                type="range"
                min={1}
                max={maxDistance}
                value={min}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  update({ range: [value, Math.max(value, max)] });
                }}
              />
            </label>
            <label>
              <span>Högst</span>
              <input
                type="range"
                min={1}
                max={maxDistance}
                value={max}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  update({ range: [Math.min(min, value), value] });
                }}
              />
            </label>
          </div>
          {setup.drawn ? (
            <>
              <TripSigns graph={graph} setup={setup} />
              <p className="fp-muted">Avstånd {distance}</p>
              <button type="button" className="fp-ghost" onClick={draw}>
                🎲 Slumpa igen
              </button>
            </>
          ) : (
            <button type="button" className="fp-b__dice" onClick={draw}>
              <span aria-hidden="true">🎲</span> Slumpa en resa
            </button>
          )}
        </div>
      )}

      <h3 className="section-heading fp-b__mode-heading">Läge</h3>
      <div className="fp-b__cards" role="radiogroup" aria-label="Läge">
        {MODES.map((entry) => (
          <div
            key={entry.key}
            className="fp-b__card"
            role="radio"
            tabIndex={0}
            aria-checked={entry.key === setup.mode}
            onClick={() => update({ mode: entry.key })}
            onKeyDown={(event) => event.key === " " && update({ mode: entry.key })}
          >
            <strong>{entry.name}</strong>
            <span>{entry.blurb}</span>
            {entry.key === "tidspress" && setup.mode === "tidspress" && (
              <span onClick={(event) => event.stopPropagation()}>
                <ThinkingTimeField
                  value={setup.thinkingTime}
                  onChange={(thinkingTime) => update({ thinkingTime })}
                />
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="fp-b__bar">
        <span>
          {setup.start && setup.destination && !problem
            ? `${kommunName(graph, setup.start)} → ${kommunName(graph, setup.destination)}`
            : "Ingen resa vald"}
          {" · "}
          {MODES.find((entry) => entry.key === setup.mode)?.name}
          {setup.mode === "tidspress" && ` ${setup.thinkingTime} s`}
        </span>
        <button
          type="button"
          className="fp-primary"
          disabled={distance === undefined}
          onClick={start}
        >
          Res
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// D: B reworked after review: mode first, then tabs; Slumpa resa starts a hidden pair at once

function VariantModeFirst({
  graph,
  setup,
  update,
  maxDistance,
  drawAndStart,
  start,
  distance,
}: VariantProps) {
  const [tab, setTab] = useState<"draw" | "pick">("draw");
  const [min, max] = setup.range;
  return (
    <section className="fp-b fp-d" aria-labelledby="fp-d-heading">
      <h2 id="fp-d-heading">Fri resa</h2>

      <h3 className="section-heading fp-b__mode-heading">Läge</h3>
      <div className="fp-b__cards" role="radiogroup" aria-label="Läge">
        {MODES.map((entry) => (
          <div
            key={entry.key}
            className="fp-b__card"
            role="radio"
            tabIndex={0}
            aria-checked={entry.key === setup.mode}
            onClick={() => update({ mode: entry.key })}
            onKeyDown={(event) => event.key === " " && update({ mode: entry.key })}
          >
            <strong>{entry.name}</strong>
            <span>{entry.blurb}</span>
            {entry.key === "tidspress" && setup.mode === "tidspress" && (
              <span onClick={(event) => event.stopPropagation()}>
                <ThinkingTimeField
                  value={setup.thinkingTime}
                  onChange={(thinkingTime) => update({ thinkingTime })}
                />
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="fp-b__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "draw"}
          onClick={() => setTab("draw")}
        >
          Slumpa
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "pick"}
          onClick={() => setTab("pick")}
        >
          Välj själv
        </button>
      </div>

      {tab === "draw" ? (
        <div className="fp-b__panel fp-d__panel" role="tabpanel">
          <DistanceRangeSlider
            min={min}
            max={max}
            limit={maxDistance}
            onChange={(range) => update({ range })}
          />
          <button type="button" className="fp-primary fp-d__dice" onClick={drawAndStart}>
            <span aria-hidden="true">🎲</span> Slumpa resa
          </button>
          <p className="fp-muted">Start och mål visas när resan börjar.</p>
        </div>
      ) : (
        <div className="fp-b__panel fp-d__panel" role="tabpanel">
          <KommunPicker
            graph={graph}
            label="Start"
            className="fp-picker--start"
            value={setup.start}
            onChange={(code) => update({ start: code, drawn: false })}
            blocked={blockedBy(graph, setup.destination)}
          />
          <KommunPicker
            graph={graph}
            label="Mål"
            className="fp-picker--destination"
            value={setup.destination}
            onChange={(code) => update({ destination: code, drawn: false })}
            blocked={blockedBy(graph, setup.start)}
          />
          {distance !== undefined && <p className="fp-muted">Avstånd {distance}</p>}
          <button
            type="button"
            className="fp-primary"
            disabled={distance === undefined}
            onClick={start}
          >
            Res
          </button>
        </div>
      )}
    </section>
  );
}

/** One track with two thumbs: two overlaid range inputs whose tracks ignore the pointer. */
export function DistanceRangeSlider({
  min,
  max,
  limit,
  onChange,
}: {
  min: number;
  max: number;
  limit: number;
  onChange: (range: [number, number]) => void;
}) {
  const percent = (value: number) => ((value - 1) / (limit - 1)) * 100;
  return (
    <div className="fp-dual">
      <p>
        Avstånd <strong>{min === max ? min : `${min}–${max}`}</strong>
      </p>
      <div className="fp-dual__track">
        <span
          className="fp-dual__fill"
          style={{ left: `${percent(min)}%`, right: `${100 - percent(max)}%` }}
        />
        <input
          type="range"
          aria-label="Minsta avstånd"
          min={1}
          max={limit}
          value={min}
          onChange={(event) => onChange([Math.min(Number(event.target.value), max), max])}
        />
        <input
          type="range"
          aria-label="Största avstånd"
          min={1}
          max={limit}
          value={max}
          onChange={(event) => onChange([min, Math.max(Number(event.target.value), min)])}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// C: the play screen's own heading and map, edited in place

function VariantSigns({
  graph,
  setup,
  update,
  maxDistance,
  draw,
  start,
  problem,
  distance,
}: VariantProps) {
  const [editing, setEditing] = useState<"start" | "destination">();
  const [rangeOpen, setRangeOpen] = useState(false);
  const [min, max] = setup.range;
  const ready = distance !== undefined && setup.start && setup.destination;

  const sign = (end: "start" | "destination") => {
    const code = setup[end];
    if (editing === end) {
      return (
        <KommunPicker
          graph={graph}
          label={end === "start" ? "Start" : "Mål"}
          className={`fp-c__picker fp-picker--${end}`}
          value={code}
          autoFocus
          onChange={(next) => next && update({ [end]: next, drawn: false })}
          blocked={blockedBy(graph, end === "start" ? setup.destination : setup.start)}
          onDone={() => setEditing(undefined)}
        />
      );
    }
    return (
      <button
        type="button"
        className={`fp-c__sign sign sign--${end} ${code ? "" : "fp-c__sign--empty"}`}
        aria-label={`${end === "start" ? "Start" : "Mål"}: ${code ? kommunName(graph, code) : "inte vald"}. Ändra`}
        onClick={() => setEditing(end)}
      >
        {code ? kommunName(graph, code) : "?"}
      </button>
    );
  };

  return (
    <section className="play-screen fp-c" aria-labelledby="fp-c-heading">
      <p className="trip-number">Fri resa{distance !== undefined && ` · avstånd ${distance}`}</p>
      <h2 id="fp-c-heading" className="fp-c__heading">
        Res från {sign("start")} till {sign("destination")}
      </h2>

      <div className="fp-c__draw">
        <button type="button" className="fp-ghost" onClick={draw}>
          🎲 Slumpa
        </button>
        <button
          type="button"
          className="fp-chip"
          aria-expanded={rangeOpen}
          onClick={() => setRangeOpen((open) => !open)}
        >
          Avstånd {min === max ? min : `${min}–${max}`} ▾
        </button>
      </div>
      {rangeOpen && (
        <div className="fp-c__range">
          <Stepper
            label="Minst"
            value={min}
            min={1}
            max={max}
            onChange={(value) => update({ range: [value, max] })}
          />
          <Stepper
            label="Högst"
            value={max}
            min={min}
            max={maxDistance}
            onChange={(value) => update({ range: [min, value] })}
          />
        </div>
      )}
      <p role="alert" className="fp-problem">
        {problem && PROBLEM_TEXT[problem]}
      </p>

      {ready ? (
        <SatelliteMap
          key={`${setup.start}-${setup.destination}`}
          graph={graph}
          trip={{ start: setup.start as KommunCode, destination: setup.destination as KommunCode }}
          cards={[]}
        />
      ) : (
        <div className="satellite-map fp-c__placeholder">
          <p>Tryck på skyltarna för att välja start och mål, eller slumpa.</p>
        </div>
      )}

      <div className="fp-c__modes" role="radiogroup" aria-label="Läge">
        {MODES.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="radio"
            className="fp-chip"
            aria-checked={entry.key === setup.mode}
            onClick={() => update({ mode: entry.key })}
          >
            {entry.name}
          </button>
        ))}
      </div>
      <p className="fp-muted">{MODES.find((entry) => entry.key === setup.mode)?.blurb}</p>
      {setup.mode === "tidspress" && (
        <Stepper
          label="Betänketid"
          unit=" s"
          value={setup.thinkingTime}
          min={5}
          max={60}
          step={5}
          onChange={(thinkingTime) => update({ thinkingTime })}
        />
      )}

      <button type="button" className="fp-primary fp-c__go" disabled={!ready} onClick={start}>
        Res
      </button>
    </section>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="fp-stepper" role="group" aria-label={label}>
      <span>{label}</span>
      <button
        type="button"
        className="fp-ghost"
        aria-label={`Minska ${label.toLowerCase()}`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - step))}
      >
        −
      </button>
      <output>
        {value}
        {unit}
      </output>
      <button
        type="button"
        className="fp-ghost"
        aria-label={`Öka ${label.toLowerCase()}`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + step))}
      >
        +
      </button>
    </div>
  );
}
