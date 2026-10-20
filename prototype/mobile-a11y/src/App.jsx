// PROTOTYPE (#15): how the play screen works on phones and with assistive tech.
// Three structurally different layouts on one route, switched with ?variant=A|B|C. Throwaway; lives only on prototype/mobile-a11y.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import {
  FEEDBACK_TEXT,
  connectedToStart,
  feedbackFor,
  fuzzyScore,
  guessLimit,
  initials,
  nextKommunHint,
  normalize,
  remainingDistance,
} from "./game.js";

const START_COLOR = "#fecc02";
const DESTINATION_COLOR = "#006aa7";
const CONNECTED_COLOR = "#4ade80";
const UNCONNECTED_COLOR = "#9ca3af";
const EOX_2016_TILES = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg";
const EOX_ATTRIBUTION =
  '<a href="https://s2maps.eu">Sentinel-2 cloudless – https://s2maps.eu</a> by <a href="https://eox.at">EOX IT Services GmbH</a> (Contains modified Copernicus Sentinel data 2016)';
const VARIANTS = { A: "Travle stacked", B: "Full-screen map + sheet", C: "List first" };

const params = new URLSearchParams(location.search);

function useData() {
  const [data, setData] = useState(null);
  useEffect(() => {
    Promise.all([fetch("/kommuner.geojson").then((r) => r.json()), fetch("/neighbors.json").then((r) => r.json())]).then(
      ([geojson, neighbors]) => setData({ geojson, neighbors }),
    );
  }, []);
  return data;
}

// Tracks the on-screen keyboard via visualViewport and exposes --vvh / --kb CSS variables.
function useKeyboard() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const keyboard = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      document.documentElement.style.setProperty("--vvh", `${viewport.height}px`);
      document.documentElement.style.setProperty("--kb", `${keyboard}px`);
      setOpen(keyboard > 120);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => (viewport.removeEventListener("resize", update), viewport.removeEventListener("scroll", update));
  }, []);
  return open;
}

export function App() {
  const data = useData();
  const [variant, setVariant] = useState(VARIANTS[params.get("variant")] ? params.get("variant") : "A");
  const [settings, setSettings] = useState({ cooperativeGestures: true, nonColorCues: true, showScreenReaderText: false });
  const keyboardOpen = useKeyboard();

  function switchTo(key) {
    const url = new URL(location.href);
    url.searchParams.set("variant", key);
    history.replaceState(null, "", url);
    setVariant(key);
  }

  if (!data) return <p className="loading">Laddar…</p>;
  return (
    <div className={settings.showScreenReaderText ? "reveal-sr" : ""}>
      <Game key={variant} variant={variant} settings={settings} keyboardOpen={keyboardOpen} {...data} />
      <VariantSwitcher current={variant} onSwitch={switchTo} />
      <PrototypePanel settings={settings} setSettings={setSettings} keyboardOpen={keyboardOpen} />
    </div>
  );
}

function useGame({ geojson, neighbors }) {
  const byCode = useMemo(() => Object.fromEntries(geojson.features.map((f) => [f.properties.code, f])), [geojson]);
  const nameOf = (code) => byCode[code].properties.name;
  const byName = useMemo(
    () => Object.fromEntries(geojson.features.map((f) => [normalize(f.properties.name), f.properties.code])),
    [geojson],
  );
  const puzzle = useMemo(
    () => ({ start: byName[normalize(params.get("from") ?? "Ystad")], destination: byName[normalize(params.get("to") ?? "Växjö")] }),
    [byName],
  );
  const shortestN = useMemo(() => remainingDistance(puzzle, [], neighbors), [puzzle, neighbors]);
  const limit = guessLimit(shortestN);

  const [guesses, setGuesses] = useState([]);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hintCodes, setHintCodes] = useState([]);
  const [toast, setToast] = useState("");
  const [announcement, setAnnouncement] = useState("");

  const guessCodes = guesses.map((g) => g.code);
  const connected = connectedToStart(puzzle, guessCodes, neighbors);
  const remaining = remainingDistance(puzzle, guessCodes, neighbors);
  const won = connected.has(puzzle.destination);
  const lost = !won && guesses.length >= limit;
  const over = won || lost;
  const extra = guesses.length - shortestN;
  const result = won ? (extra === 0 && hintsUsed === 0 ? "Perfekt! 🎉" : `Du klarade det! +${extra}`) : lost ? `Slut på gissningar – ${remaining} kvar` : "";

  function exactMatch(text) {
    const literal = geojson.features.find((f) => f.properties.name.toLowerCase() === text.trim().toLowerCase());
    return literal ? literal.properties.code : byName[normalize(text)];
  }

  function reject(message) {
    setToast(message);
    setAnnouncement(message);
  }

  function submit(text) {
    const code = exactMatch(text);
    if (over) return reject("Spelet är slut") || true;
    if (!code) return reject(`Okänd kommun: ${text}`) || false;
    if (code === puzzle.start || code === puzzle.destination) return reject(`Det är start-/målkommunen: ${nameOf(code)}`) || true;
    if (guessCodes.includes(code)) return reject(`Redan gissad: ${nameOf(code)}`) || true;
    const feedback = feedbackFor(puzzle, guessCodes, code, neighbors);
    const nextGuesses = [...guessCodes, code];
    const nowConnected = connectedToStart(puzzle, nextGuesses, neighbors);
    const done = nowConnected.has(puzzle.destination);
    setToast("");
    setGuesses([...guesses, { code, feedback }]);
    setAnnouncement(
      `Gissning ${guesses.length + 1} av ${limit}: ${nameOf(code)}, ${FEEDBACK_TEXT[feedback]}${nowConnected.has(code) ? ", ansluten till start" : ""}.` +
        (done ? " Du nådde målet!" : nextGuesses.length >= limit ? " Slut på gissningar." : ""),
    );
    return true;
  }

  function takeHint() {
    if (hintsUsed >= 3 || over) return;
    const next = hintsUsed + 1;
    setHintsUsed(next);
    if (next === 1) {
      const code = nextKommunHint(puzzle, guessCodes, neighbors);
      if (code) setHintCodes([code]);
      setAnnouncement("Ledtråd 1: nästa kommun på en kortaste väg visas som kontur på kartan.");
    }
    if (next === 2) setAnnouncement("Ledtråd 2: alla kommuners konturer visas på kartan.");
    if (next === 3) setAnnouncement("Ledtråd 3: konturerna visar kommunernas initialer.");
  }

  const suggestable = useMemo(
    () => geojson.features.map((f) => f.properties).sort((a, b) => a.name.localeCompare(b.name, "sv")),
    [geojson],
  );
  function suggestionsFor(text) {
    const query = normalize(text);
    if (!query) return [];
    return suggestable
      .map((k) => ({ ...k, score: fuzzyScore(query, k.name) }))
      .filter((k) => k.score > -Infinity)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((k) => ({
        ...k,
        tag: k.code === puzzle.start ? "start" : k.code === puzzle.destination ? "mål" : guessCodes.includes(k.code) ? "redan gissad" : "",
      }));
  }

  return {
    geojson, byCode, nameOf, puzzle, limit, guesses, connected, over, won, result, hintsUsed, hintCodes, toast, announcement,
    submit, takeHint, exactMatch, suggestionsFor, reset: () => (setGuesses([]), setHintsUsed(0), setHintCodes([]), setToast("")),
  };
}

function Game({ variant, settings, keyboardOpen, ...data }) {
  const game = useGame(data);
  const Layout = { A: VariantA, B: VariantB, C: VariantC }[variant];
  return (
    <>
      <Layout game={game} settings={settings} keyboardOpen={keyboardOpen} />
      <p className="sr-only" role="status" aria-live="polite">
        {game.announcement}
      </p>
    </>
  );
}

// --- Variant A: Travle's stacked column; map shrinks and input pins above the keyboard while typing. ---
function VariantA({ game, settings, keyboardOpen }) {
  return (
    <main className={`page variant-a ${keyboardOpen ? "keyboard-open" : ""}`}>
      <Header game={game} />
      <Prompt game={game} />
      <GameMap game={game} settings={settings} className="map map-a" />
      {game.over ? <p className="result">{game.result}</p> : <GuessInput game={game} suggestionsAbove={keyboardOpen} className="pin-above-keyboard" />}
      <div className="row">
        <Toast game={game} />
        <HintButton game={game} />
      </div>
      <GuessCards game={game} />
    </main>
  );
}

// --- Variant B: full-screen map, everything else in a bottom sheet. ---
function VariantB({ game, settings, keyboardOpen }) {
  const [sheet, setSheet] = useState("peek");
  const dragStart = useRef(null);
  const order = ["peek", "half", "full"];
  const step = (delta) => setSheet((s) => order[Math.min(2, Math.max(0, order.indexOf(s) + delta))]);
  return (
    <main className="variant-b">
      <GameMap game={game} settings={settings} className="map map-b" fitPadding={{ top: 90, bottom: 200, left: 30, right: 30 }} />
      <div className="b-header">
        <span className="b-title">Åkle #42</span>
        <Prompt game={game} />
      </div>
      <section className={`sheet sheet-${keyboardOpen ? "keyboard" : sheet}`} aria-label="Gissningar">
        <button
          className="sheet-handle"
          aria-expanded={sheet !== "peek"}
          aria-label={sheet === "full" ? "Minimera gissningar" : "Visa fler gissningar"}
          onClick={() => setSheet((s) => order[(order.indexOf(s) + 1) % 3])}
          onPointerDown={(e) => (dragStart.current = e.clientY)}
          onPointerUp={(e) => {
            const delta = dragStart.current - e.clientY;
            if (Math.abs(delta) > 30) (e.preventDefault(), step(delta > 0 ? 1 : -1));
            dragStart.current = null;
          }}
        >
          <span />
        </button>
        {game.over ? <p className="result">{game.result}</p> : <GuessInput game={game} suggestionsAbove />}
        <div className="row">
          <Toast game={game} />
          <HintButton game={game} />
          <span className="muted">{game.guesses.length} gissningar</span>
        </div>
        <GuessCards game={game} />
      </section>
    </main>
  );
}

// --- Variant C: list first; the map is an optional panel and the game is fully playable as text. ---
function VariantC({ game, settings }) {
  const [mapOpen, setMapOpen] = useState(window.matchMedia("(min-width: 700px)").matches);
  const mapId = useId();
  const chain = [...game.connected].filter((c) => c !== game.puzzle.start && c !== game.puzzle.destination);
  return (
    <main className="page variant-c">
      <Header game={game} />
      <Prompt game={game} />
      {game.over ? <p className="result">{game.result}</p> : <GuessInput game={game} />}
      <div className="row">
        <Toast game={game} />
        <HintButton game={game} />
      </div>
      <p className="chain">
        <strong>Ansluten kedja:</strong> {[game.puzzle.start, ...chain].map(game.nameOf).join(" → ")}
        {game.won ? ` → ${game.nameOf(game.puzzle.destination)} ✔` : " → …"}
      </p>
      <GuessTable game={game} />
      <button className="map-toggle" aria-expanded={mapOpen} aria-controls={mapId} onClick={() => setMapOpen(!mapOpen)}>
        {mapOpen ? "Dölj karta ▴" : "Visa karta ▾"}
      </button>
      <div id={mapId} hidden={!mapOpen} className="map-c-wrap">
        {mapOpen && <GameMap game={game} settings={settings} className="map map-c" />}
      </div>
    </main>
  );
}

function Header({ game }) {
  return (
    <header>
      <h1>Åkle</h1>
      <p className="subtitle">
        Dagens pussel #42 · <span aria-label={`${game.limit} gissningar tillåtna`}>max {game.limit}</span>
      </p>
    </header>
  );
}

function Prompt({ game }) {
  return (
    <p className="prompt">
      Res från <strong className="endpoint start">{game.nameOf(game.puzzle.start)}</strong> till{" "}
      <strong className="endpoint destination">{game.nameOf(game.puzzle.destination)}</strong>
    </p>
  );
}

function Toast({ game }) {
  return (
    <p className="toast" role="alert">
      {game.toast}
    </p>
  );
}

function HintButton({ game }) {
  if (game.over) return null;
  return (
    <button className="hint-button" onClick={game.takeHint} disabled={game.hintsUsed >= 3} aria-label={`Ledtråd, ${game.hintsUsed} av 3 använda`}>
      💡 Ledtråd ({game.hintsUsed}/3)
    </button>
  );
}

function GuessCards({ game }) {
  return (
    <ol className="guesses" aria-label="Dina gissningar">
      {game.guesses.map((g, i) => (
        <li key={g.code} className={game.connected.has(g.code) ? "is-connected" : ""}>
          <span aria-hidden="true">{g.feedback}</span> {game.nameOf(g.code)}
          <span className="sr-only">
            , gissning {i + 1}, {FEEDBACK_TEXT[g.feedback]}
            {game.connected.has(g.code) ? ", ansluten till start" : ""}
          </span>
        </li>
      ))}
    </ol>
  );
}

function GuessTable({ game }) {
  if (!game.guesses.length) return <p className="muted">Inga gissningar än.</p>;
  return (
    <table className="guess-table">
      <caption className="sr-only">Dina gissningar</caption>
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Kommun</th>
          <th scope="col">Resultat</th>
          <th scope="col">Ansluten</th>
        </tr>
      </thead>
      <tbody>
        {game.guesses.map((g, i) => (
          <tr key={g.code}>
            <td>{i + 1}</td>
            <th scope="row">{game.nameOf(g.code)}</th>
            <td>
              <span aria-hidden="true">{g.feedback}</span> {FEEDBACK_TEXT[g.feedback]}
            </td>
            <td>{game.connected.has(g.code) ? "Ja" : "Nej"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ARIA 1.2 combobox with the two-step input from "How are typed kommun names matched?" (#12).
function GuessInput({ game, suggestionsAbove = false, className = "" }) {
  const [text, setText] = useState("");
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const suggestions = open ? game.suggestionsFor(text) : [];
  const enabled = suggestions.map((s, i) => (s.tag ? -1 : i)).filter((i) => i >= 0);
  const isExact = Boolean(game.exactMatch(text));

  function fill(name) {
    setText(name);
    setActive(-1);
    setOpen(false);
  }

  function submitText() {
    if (game.submit(text.trim())) (setText(""), setOpen(false));
    setActive(-1);
  }

  function moveActive(delta) {
    if (!enabled.length) return;
    const position = enabled.indexOf(active);
    const next = position === -1 ? (delta > 0 ? 0 : enabled.length - 1) : (position + delta + enabled.length) % enabled.length;
    setActive(enabled[next]);
  }

  return (
    <form
      className={`guess-input ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        if (active >= 0) return fill(suggestions[active].name);
        if (isExact) return submitText();
        if (enabled.length) return fill(suggestions[enabled[0]].name);
        game.submit(text.trim());
      }}
    >
      <label className="sr-only" htmlFor={`${listId}-input`}>
        Gissa en kommun
      </label>
      <input
        id={`${listId}-input`}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={suggestions.length > 0}
        aria-controls={listId}
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint={isExact ? "send" : "next"}
        value={text}
        placeholder="Skriv en kommun…"
        onChange={(e) => (setText(e.target.value), setActive(-1), setOpen(true))}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") (e.preventDefault(), moveActive(1));
          if (e.key === "ArrowUp") (e.preventDefault(), moveActive(-1));
          if (e.key === "Escape") setOpen(false);
        }}
      />
      <button type="button" onClick={submitText} className="guess-button">
        Gissa{" "}
        <span aria-label={`, ${game.guesses.length} av ${game.limit} använda`}>
          ({game.guesses.length}/{game.limit})
        </span>
      </button>
      <ul id={listId} role="listbox" aria-label="Förslag" className={`suggestions ${suggestionsAbove ? "above" : ""}`} hidden={!suggestions.length}>
        {suggestions.map((s, i) => (
          <li
            key={s.code}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            aria-disabled={Boolean(s.tag)}
            className={`${i === active ? "active" : ""} ${s.tag ? "disabled" : ""}`}
            onMouseDown={(e) => (e.preventDefault(), !s.tag && fill(s.name))}
          >
            {s.name} {s.tag && <em>{s.tag}</em>}
          </li>
        ))}
      </ul>
    </form>
  );
}

function GameMap({ game, settings, className, fitPadding = 40 }) {
  const container = useRef(null);
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);
  const { geojson, puzzle, guesses, connected, hintsUsed, hintCodes } = game;
  const descriptionId = useId();

  useEffect(() => {
    const map = new maplibregl.Map({
      container: container.current,
      style: {
        version: 8,
        sources: { satellite: { type: "raster", tiles: [EOX_2016_TILES], tileSize: 256, maxzoom: 14, attribution: EOX_ATTRIBUTION } },
        layers: [{ id: "satellite", type: "raster", source: "satellite", paint: { "raster-saturation": 0.5 } }],
      },
      bounds: [10.9, 55.3, 24.2, 69.1],
      maxBounds: [4, 53, 32, 71],
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: { compact: true },
      cooperativeGestures: settings.cooperativeGestures,
      locale: {
        "CooperativeGesturesHandler.WindowsHelpText": "Håll Ctrl och scrolla för att zooma kartan",
        "CooperativeGesturesHandler.MacHelpText": "Håll ⌘ och scrolla för att zooma kartan",
        "CooperativeGesturesHandler.MobileHelpText": "Använd två fingrar för att flytta kartan",
        "NavigationControl.ZoomIn": "Zooma in",
        "NavigationControl.ZoomOut": "Zooma ut",
      },
    });
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.getCanvas().setAttribute("aria-label", "Karta. Piltangenter flyttar, plus och minus zoomar.");
    let cancelled = false;
    map.on("load", () => {
      if (cancelled) return;
      const empty = { type: "FeatureCollection", features: [] };
      map.addSource("hints", { type: "geojson", data: empty });
      map.addSource("drawn", { type: "geojson", data: empty });
      map.addLayer({ id: "hint-fill", type: "fill", source: "hints", paint: { "fill-color": "#fff", "fill-opacity": 0.01 } });
      map.addLayer({ id: "hint-line", type: "line", source: "hints", paint: { "line-color": "#fff", "line-width": 1, "line-opacity": 0.5 } });
      map.addLayer({ id: "drawn-fill", type: "fill", source: "drawn", paint: { "fill-color": ["get", "color"], "fill-opacity": 0.25 } });
      map.addLayer({ id: "drawn-line", type: "line", source: "drawn", filter: ["!=", ["get", "dashed"], true], paint: { "line-color": ["get", "color"], "line-width": 1.5 } });
      map.addLayer({
        id: "drawn-line-dashed",
        type: "line",
        source: "drawn",
        filter: ["==", ["get", "dashed"], true],
        paint: { "line-color": ["get", "color"], "line-width": 1.5, "line-dasharray": [2, 2] },
      });
      map.addLayer({
        id: "drawn-label",
        type: "symbol",
        source: "drawn",
        filter: ["has", "badge"],
        layout: { "text-field": ["get", "badge"], "text-size": 14, "text-allow-overlap": true },
        paint: { "text-color": "#fff", "text-halo-color": "#000", "text-halo-width": 1.5 },
      });
      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: "kommun-tooltip" });
      const tooltipAt = (e) => {
        const [feature] = map.queryRenderedFeatures(e.point, { layers: ["drawn-fill", "hint-fill"] });
        if (!feature) return popup.remove();
        popup.setLngLat(e.lngLat).setText(feature.properties.tooltip).addTo(map);
      };
      map.on("mousemove", (e) => matchMedia("(hover: hover)").matches && tooltipAt(e));
      map.on("click", tooltipAt);
      container.current.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
      mapRef.current = map;
      setReady(true);
    });
    const resize = new ResizeObserver(() => map.resize());
    resize.observe(container.current);
    return () => ((cancelled = true), resize.disconnect(), map.remove(), (mapRef.current = null), setReady(false));
  }, [geojson]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    settings.cooperativeGestures ? mapRef.current.cooperativeGestures.enable() : mapRef.current.cooperativeGestures.disable();
  }, [ready, settings.cooperativeGestures]);

  const layers = useMemo(() => {
    const feature = (code, extra) => ({ ...game.byCode[code], properties: { ...game.byCode[code].properties, ...extra } });
    const drawnCodes = new Set([puzzle.start, puzzle.destination, ...guesses.map((g) => g.code)]);
    const cue = settings.nonColorCues;
    const drawn = [
      feature(puzzle.start, { color: START_COLOR, tooltip: `${game.nameOf(puzzle.start)} (start)` }),
      feature(puzzle.destination, { color: DESTINATION_COLOR, tooltip: `${game.nameOf(puzzle.destination)} (mål)` }),
      ...guesses.map((g) => {
        const isConnected = connected.has(g.code);
        return feature(g.code, {
          color: isConnected ? CONNECTED_COLOR : UNCONNECTED_COLOR,
          tooltip: `${game.nameOf(g.code)} – ${isConnected ? "ansluten" : "inte ansluten"}`,
          dashed: cue && !isConnected,
        });
      }),
    ];
    const hintSource = hintsUsed >= 2 ? geojson.features.map((f) => f.properties.code) : hintCodes;
    const hints = hintSource
      .filter((code) => !drawnCodes.has(code))
      .map((code) => feature(code, { tooltip: hintsUsed >= 3 ? initials(game.nameOf(code)) : "?" }));
    return { drawn: { type: "FeatureCollection", features: drawn }, hints: { type: "FeatureCollection", features: hints } };
  }, [game, geojson, puzzle, guesses, connected, hintsUsed, hintCodes, settings.nonColorCues]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    mapRef.current.getSource("drawn").setData(layers.drawn);
    mapRef.current.getSource("hints").setData(layers.hints);
  }, [ready, layers]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const bounds = new maplibregl.LngLatBounds();
    for (const f of layers.drawn.features.slice(0, 2)) {
      const polygons = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const p of polygons) for (const c of p[0]) bounds.extend(c);
    }
    mapRef.current.fitBounds(bounds, { padding: fitPadding, duration: 0 });
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const connectedNames = guesses.filter((g) => connected.has(g.code)).map((g) => game.nameOf(g.code));
  const looseNames = guesses.filter((g) => !connected.has(g.code)).map((g) => game.nameOf(g.code));
  return (
    <section className={className} aria-label="Karta" aria-describedby={descriptionId}>
      <div ref={container} className="map-canvas" />
      <p id={descriptionId} className="sr-only">
        Satellitkarta. Start {game.nameOf(puzzle.start)} är gul, mål {game.nameOf(puzzle.destination)} är blå.{" "}
        {connectedNames.length ? `Anslutna till start: ${connectedNames.join(", ")}. ` : ""}
        {looseNames.length ? `Inte anslutna: ${looseNames.join(", ")}. ` : ""}
        {hintsUsed >= 1 ? `${layers.hints.features.length} ledtrådskonturer visas.` : ""}
      </p>
    </section>
  );
}

function VariantSwitcher({ current, onSwitch }) {
  const keys = Object.keys(VARIANTS);
  const cycle = (delta) => onSwitch(keys[(keys.indexOf(current) + delta + keys.length) % keys.length]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.("input, textarea, [contenteditable], .maplibregl-canvas")) return;
      if (e.key === "ArrowLeft") cycle(-1);
      if (e.key === "ArrowRight") cycle(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return (
    <nav className="variant-switcher" aria-label="PROTOTYPE variant switcher">
      <button onClick={() => cycle(-1)} aria-label="Previous variant">‹</button>
      <span>
        {current} ({VARIANTS[current]})
      </span>
      <button onClick={() => cycle(1)} aria-label="Next variant">›</button>
    </nav>
  );
}

function PrototypePanel({ settings, setSettings, keyboardOpen }) {
  const [open, setOpen] = useState(false);
  const toggle = (key, label) => (
    <label className="check">
      <input type="checkbox" checked={settings[key]} onChange={(e) => setSettings({ ...settings, [key]: e.target.checked })} /> {label}
    </label>
  );
  return (
    <aside className={`prototype-panel ${open ? "open" : ""}`}>
      <button className="toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        PROTO {open ? "▾" : "▸"}
      </button>
      {open && (
        <>
          {toggle("cooperativeGestures", "Two-finger map pan (cooperative gestures)")}
          {toggle("nonColorCues", "Non-colour cue (dashed = not connected)")}
          {toggle("showScreenReaderText", "Reveal screen-reader-only text")}
          <p className="hint">
            Puzzle: <code>?from=Kiruna&amp;to=Umeå</code>
            <br />
            Keyboard open: <code>{String(keyboardOpen)}</code>
          </p>
        </>
      )}
    </aside>
  );
}
