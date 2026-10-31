// PROTOTYPE (#126): switches the mode palette live with ?palette=B|D|E|F|G or the ← → keys. Throwaway.
import { useEffect, useState } from "react";
import { MODE_KINDS, type ModeKind } from "../freePlay/linkPayload";
import { MODE_NAMES } from "./messages";
import "./ModePalettePrototype.css";

const PALETTES: Record<string, { name: string; colours: Record<ModeKind, string> }> = {
  B: {
    name: "Soft",
    colours: {
      standard: "#b09cff",
      unlimited: "#ffc4e4",
      timed: "#f5a56f",
      "tie-breaker": "#4fc3d9",
    },
  },
  D: {
    name: "Soft, clearer",
    colours: {
      standard: "#bda8fc",
      unlimited: "#fecee4",
      timed: "#e9a679",
      "tie-breaker": "#72a8b6",
    },
  },
  E: {
    name: "Soft, quiet Standard",
    colours: {
      standard: "#e4ecf5",
      unlimited: "#c8b7ff",
      timed: "#f2a26a",
      "tie-breaker": "#72a8b6",
    },
  },
  F: {
    name: "Periwinkle and mint",
    colours: {
      standard: "#8998e9",
      unlimited: "#f3d1f4",
      timed: "#c69356",
      "tie-breaker": "#31c3b5",
    },
  },
  G: {
    name: "Lavender and sky",
    colours: {
      standard: "#e7d5ff",
      unlimited: "#c08f99",
      timed: "#d9c190",
      "tie-breaker": "#67b5e1",
    },
  },
};
const KEYS = Object.keys(PALETTES);
const STORAGE_KEY = "prototype-mode-palette";

function luminance(hex: string): number {
  const channel = (start: number) => {
    const c = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): string {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return ((high + 0.05) / (low + 0.05)).toFixed(1);
}

const nextKey = (current: string, by: number) =>
  KEYS[(KEYS.indexOf(current) + by + KEYS.length) % KEYS.length] as string;

export function ModePalettePrototype() {
  const [key, setKey] = useState(() => {
    const asked = new URLSearchParams(window.location.search).get("palette");
    const wanted = asked ?? sessionStorage.getItem(STORAGE_KEY) ?? "B";
    return wanted in PALETTES ? wanted : "B";
  });
  const palette = PALETTES[key] as (typeof PALETTES)[string];

  useEffect(() => {
    for (const kind of MODE_KINDS) {
      document.documentElement.style.setProperty(`--mode-${kind}`, palette.colours[kind]);
    }
    sessionStorage.setItem(STORAGE_KEY, key);
    const url = new URL(window.location.href);
    url.searchParams.set("palette", key);
    window.history.replaceState(window.history.state, "", url);
  }, [key, palette]);

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
    <aside className="palette-prototype" aria-label="Prototyp: färgpalett">
      <button type="button" onClick={() => setKey(nextKey(key, -1))} aria-label="Föregående palett">
        ←
      </button>
      <span className="palette-prototype-name">
        {key} ({palette.name})
      </span>
      <button type="button" onClick={() => setKey(nextKey(key, 1))} aria-label="Nästa palett">
        →
      </button>
      <span className="palette-prototype-swatches">
        {MODE_KINDS.map((kind) => (
          <span
            key={kind}
            className="palette-prototype-swatch"
            style={{ "--swatch": palette.colours[kind] } as React.CSSProperties}
            title="Kontrast mot --night / --surface"
          >
            {MODE_NAMES[kind]} {contrast(palette.colours[kind], "#0d1620")} /{" "}
            {contrast(palette.colours[kind], "#16222e")}
          </span>
        ))}
      </span>
    </aside>
  );
}
