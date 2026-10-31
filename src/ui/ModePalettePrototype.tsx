// PROTOTYPE (#126): switches how a mode's colour is marked, with ?marker= or the ← → keys. Throwaway.
import { useEffect, useState } from "react";
import "./ModePalettePrototype.css";

const MARKERS: Record<string, string> = {
  name: "Coloured name",
  edge: "Edge bars, coloured names in label and legend",
  pill: "Pills",
};
const KEYS = Object.keys(MARKERS);
const STORAGE_KEY = "prototype-mode-marker";

const nextKey = (current: string, by: number) =>
  KEYS[(KEYS.indexOf(current) + by + KEYS.length) % KEYS.length] as string;

export function ModePalettePrototype() {
  const [key, setKey] = useState(() => {
    const asked = new URLSearchParams(window.location.search).get("marker");
    const wanted = asked ?? sessionStorage.getItem(STORAGE_KEY) ?? "name";
    return wanted in MARKERS ? wanted : "name";
  });

  useEffect(() => {
    document.documentElement.dataset.marker = key;
    sessionStorage.setItem(STORAGE_KEY, key);
    const url = new URL(window.location.href);
    url.searchParams.set("marker", key);
    window.history.replaceState(window.history.state, "", url);
  }, [key]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const target = event.target as HTMLElement;
      if (event.defaultPrevented || target.closest("input, textarea, [contenteditable]")) return;
      setKey((current) => nextKey(current, event.key === "ArrowLeft" ? -1 : 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <aside className="palette-prototype" aria-label="Prototyp: färgmarkering">
      <button type="button" onClick={() => setKey(nextKey(key, -1))} aria-label="Föregående">
        ←
      </button>
      <span className="palette-prototype-name">{MARKERS[key]}</span>
      <button type="button" onClick={() => setKey(nextKey(key, 1))} aria-label="Nästa">
        →
      </button>
    </aside>
  );
}
