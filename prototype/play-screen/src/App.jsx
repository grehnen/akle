// PROTOTYPE: Travle-style centered play screen on a satellite background. Throwaway; lives only on prototype/play-screen.
import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { connectedToStart, feedbackFor, guessLimit, normalize, remainingDistance } from "./game.js";

const FEEDBACK_COLORS = { "✅": "#16a34a", "🟩": "#4ade80", "🟧": "#f97316", "🟥": "#dc2626" };
const ENDPOINT_COLOR = "#facc15";
const UNCONNECTED_COLOR = "#9ca3af";
const EOX_2016_TILES = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg";
const EOX_ATTRIBUTION =
  '<a href="https://s2maps.eu">Sentinel-2 cloudless – https://s2maps.eu</a> by <a href="https://eox.at">EOX IT Services GmbH</a> (Contains modified Copernicus Sentinel data 2016)';

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

export function App() {
  const data = useData();
  if (!data) return <p className="loading">Laddar…</p>;
  return <Game {...data} />;
}

function Game({ geojson, neighbors }) {
  const byCode = useMemo(() => Object.fromEntries(geojson.features.map((f) => [f.properties.code, f])), [geojson]);
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
  const [message, setMessage] = useState("");
  const [look, setLook] = useState({ brightness: 0.85, saturation: -0.1, fillOpacity: 0.55, outlineWidth: 1.5 });

  const guessCodes = guesses.map((g) => g.code);
  const connected = connectedToStart(puzzle, guessCodes, neighbors);
  const remaining = remainingDistance(puzzle, guessCodes, neighbors);
  const won = connected.has(puzzle.destination);
  const lost = !won && guesses.length >= limit;
  const over = won || lost;
  const extra = guesses.length - shortestN;

  function submit(name) {
    const code = byName[normalize(name)];
    if (!code) return setMessage(`Okänd kommun: ${name}`);
    if (code === puzzle.start || code === puzzle.destination) return setMessage("Det är start- eller målkommunen.");
    if (guessCodes.includes(code)) return setMessage(`Du har redan gissat ${byCode[code].properties.name}.`);
    setMessage("");
    setGuesses([...guesses, { code, feedback: feedbackFor(puzzle, guessCodes, code, neighbors) }]);
  }

  return (
    <main className="page">
      <header>
        <h1>Åkle</h1>
        <p className="subtitle">Dagens pussel #42</p>
      </header>
      <p className="prompt">
        Res från <strong className="endpoint">{byCode[puzzle.start].properties.name}</strong> till{" "}
        <strong className="endpoint">{byCode[puzzle.destination].properties.name}</strong>
      </p>

      <GameMap
        geojson={geojson}
        puzzle={puzzle}
        guesses={guesses}
        connected={connected}
        look={look}
      />

      <p className="counter">
        {over ? (won ? (extra === 0 ? "Perfekt! 🎉" : `Du klarade det! +${extra}`) : `Slut på gissningar – ${remaining} kvar`) : `Gissningar kvar: ${limit - guesses.length} av ${limit}`}
      </p>

      {!over && <GuessInput names={geojson.features.map((f) => f.properties.name)} onSubmit={submit} />}
      {message && <p className="message">{message}</p>}

      <ol className="guesses">
        {[...guesses].reverse().map((g) => (
          <li key={g.code}>
            <span>{g.feedback}</span> {byCode[g.code].properties.name}
          </li>
        ))}
      </ol>

      <PrototypePanel
        look={look}
        setLook={setLook}
        state={{ shortestN, limit, remaining, guesses: guesses.length, connected: [...connected].map((c) => byCode[c].properties.name) }}
        onReset={() => setGuesses([])}
      />
    </main>
  );
}

function GameMap({ geojson, puzzle, guesses, connected, look }) {
  const container = useRef(null);
  const mapRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const map = new maplibregl.Map({
      container: container.current,
      style: {
        version: 8,
        sources: { satellite: { type: "raster", tiles: [EOX_2016_TILES], tileSize: 256, maxzoom: 14, attribution: EOX_ATTRIBUTION } },
        layers: [{ id: "satellite", type: "raster", source: "satellite" }],
      },
      bounds: [10.9, 55.3, 24.2, 69.1],
      maxBounds: [4, 53, 32, 71],
      dragRotate: false,
      attributionControl: { compact: true },
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      map.addSource("drawn", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "drawn-fill", type: "fill", source: "drawn", paint: { "fill-color": ["get", "color"], "fill-opacity": 0.55 } });
      map.addLayer({ id: "drawn-line", type: "line", source: "drawn", paint: { "line-color": "#fff", "line-width": 1.5 } });
      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });
      map.on("mousemove", "drawn-fill", (e) => popup.setLngLat(e.lngLat).setText(e.features[0].properties.name).addTo(map));
      map.on("mouseleave", "drawn-fill", () => popup.remove());
      container.current.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
      mapRef.current = map;
      setReady(true);
    });
    return () => map.remove();
  }, [geojson]);

  const drawn = useMemo(() => {
    const byCode = Object.fromEntries(geojson.features.map((f) => [f.properties.code, f]));
    const feature = (code, color) => ({ ...byCode[code], properties: { ...byCode[code].properties, color } });
    return {
      type: "FeatureCollection",
      features: [
        feature(puzzle.start, ENDPOINT_COLOR),
        feature(puzzle.destination, ENDPOINT_COLOR),
        ...guesses.map((g) => feature(g.code, connected.has(g.code) ? FEEDBACK_COLORS[g.feedback] : UNCONNECTED_COLOR)),
      ],
    };
  }, [geojson, puzzle, guesses, connected]);

  useEffect(() => {
    if (!ready) return;
    mapRef.current.getSource("drawn").setData(drawn);
  }, [ready, drawn]);

  useEffect(() => {
    if (!ready) return;
    const bounds = new maplibregl.LngLatBounds();
    for (const f of drawn.features.slice(0, 2)) {
      const polygons = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const p of polygons) for (const c of p[0]) bounds.extend(c);
    }
    mapRef.current.fitBounds(bounds, { padding: 60, duration: 0 });
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    map.setPaintProperty("satellite", "raster-brightness-max", look.brightness);
    map.setPaintProperty("satellite", "raster-saturation", look.saturation);
    map.setPaintProperty("drawn-fill", "fill-opacity", look.fillOpacity);
    map.setPaintProperty("drawn-line", "line-width", look.outlineWidth);
  }, [ready, look]);

  return <div ref={container} className="map" />;
}

function GuessInput({ names, onSubmit }) {
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);
  const query = normalize(text);
  const suggestions = query
    ? names
        .filter((n) => normalize(n).includes(query))
        .sort((a, b) => normalize(b).startsWith(query) - normalize(a).startsWith(query) || a.localeCompare(b, "sv"))
        .slice(0, 6)
    : [];

  function choose(name) {
    onSubmit(name);
    setText("");
    setActive(0);
  }

  return (
    <form
      className="guess-input"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) choose(suggestions[active] ?? text.trim());
      }}
    >
      <input
        autoFocus
        value={text}
        placeholder="Skriv en kommun…"
        onChange={(e) => (setText(e.target.value), setActive(0))}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => Math.min(a + 1, suggestions.length - 1)));
          if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)));
        }}
      />
      <button type="submit">Gissa</button>
      {suggestions.length > 0 && (
        <ul className="suggestions">
          {suggestions.map((n, i) => (
            <li key={n} className={i === active ? "active" : ""} onMouseDown={(e) => (e.preventDefault(), choose(n))}>
              {n}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

function PrototypePanel({ look, setLook, state, onReset }) {
  const [open, setOpen] = useState(true);
  const slider = (key, label, min, max, step) => (
    <label>
      {label} <code>{look[key]}</code>
      <input type="range" min={min} max={max} step={step} value={look[key]} onChange={(e) => setLook({ ...look, [key]: Number(e.target.value) })} />
    </label>
  );
  return (
    <aside className="prototype-panel">
      <button className="toggle" onClick={() => setOpen(!open)}>
        PROTOTYPE {open ? "▾" : "▸"}
      </button>
      {open && (
        <>
          {slider("brightness", "Satellite brightness", 0.2, 1, 0.05)}
          {slider("saturation", "Satellite saturation", -1, 0.5, 0.05)}
          {slider("fillOpacity", "Kommun fill opacity", 0.1, 1, 0.05)}
          {slider("outlineWidth", "Outline width", 0, 4, 0.5)}
          <p className="hint">Puzzle via URL: <code>?from=Kiruna&amp;to=Umeå</code></p>
          <button onClick={onReset}>Reset guesses</button>
          <pre>{JSON.stringify(state, null, 1)}</pre>
        </>
      )}
    </aside>
  );
}
