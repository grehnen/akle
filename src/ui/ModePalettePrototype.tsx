// PROTOTYPE (#126): compares legend and label markers, with ?legend= and ?label= or the bar. Throwaway.
import { useEffect, useState } from "react";
import "./ModePalettePrototype.css";

const LEGEND = ["name", "edge", "pill"];
const LABEL = ["name", "tick", "edge", "pill"];

function useChoice(param: "legend" | "label", options: string[]) {
  const [choice, setChoice] = useState(() => {
    const wanted =
      new URLSearchParams(window.location.search).get(param) ??
      sessionStorage.getItem(`prototype-${param}`) ??
      "name";
    return options.includes(wanted) ? wanted : "name";
  });
  useEffect(() => {
    document.documentElement.dataset[param] = choice;
    sessionStorage.setItem(`prototype-${param}`, choice);
    const url = new URL(window.location.href);
    url.searchParams.set(param, choice);
    window.history.replaceState(window.history.state, "", url);
  }, [param, choice]);
  const step = (by: number) =>
    setChoice(options[(options.indexOf(choice) + by + options.length) % options.length] as string);
  return { choice, step };
}

function Cycler({
  title,
  choice,
  step,
}: {
  title: string;
  choice: string;
  step: (by: number) => void;
}) {
  return (
    <span className="palette-prototype-cycler">
      <button type="button" onClick={() => step(-1)} aria-label={`${title}: previous`}>
        ←
      </button>
      <span className="palette-prototype-name">
        {title}: {choice}
      </span>
      <button type="button" onClick={() => step(1)} aria-label={`${title}: next`}>
        →
      </button>
    </span>
  );
}

export function ModePalettePrototype() {
  const legend = useChoice("legend", LEGEND);
  const label = useChoice("label", LABEL);
  return (
    <aside className="palette-prototype" aria-label="Prototype: legend and label markers">
      <Cycler title="Legend" {...legend} />
      <Cycler title="Label" {...label} />
    </aside>
  );
}
