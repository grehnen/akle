// PROTOTYPE: throwaway variant switcher for UI prototypes. Never merge to main.
import { useEffect } from "react";

type PrototypeSwitcherProps = {
  variants: readonly { key: string; name: string }[];
  current: string;
  onChange: (key: string) => void;
};

export function PrototypeSwitcher({ variants, current, onChange }: PrototypeSwitcherProps) {
  const index = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current),
  );
  const step = (by: number) =>
    onChange(variants[(index + by + variants.length) % variants.length].key);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!import.meta.env.DEV) return null;
  const variant = variants[index];
  return (
    <div
      style={{
        position: "fixed",
        bottom: "max(1rem, env(safe-area-inset-bottom))",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.25rem",
        borderRadius: "999px",
        background: "#ff2fb4",
        color: "#000",
        boxShadow: "0 4px 18px rgb(0 0 0 / 60%)",
        fontFamily: "monospace",
        fontSize: "0.9rem",
      }}
    >
      <button type="button" aria-label="Föregående variant" onClick={() => step(-1)} style={pill}>
        ←
      </button>
      <span style={{ whiteSpace: "nowrap" }}>
        {variant.key} ({variant.name})
      </span>
      <button type="button" aria-label="Nästa variant" onClick={() => step(1)} style={pill}>
        →
      </button>
    </div>
  );
}

const pill = {
  minHeight: "2.25rem",
  padding: "0 0.8rem",
  borderRadius: "999px",
  background: "#000",
  color: "#ff2fb4",
};
