import { type KeyboardEvent, useRef, useState } from "react";
import type { Trip } from "../engine/game";
import { endpointSuggestions, pickedTrip, resolveEndpoint } from "../freePlay/endpoints";
import type { GraphVersion, KommunCode } from "../graph/graphVersion";
import { EndpointField } from "./EndpointField";
import "./FreePlayScreen.css";

/** The two ways to choose a trip: draw one (Slumpa) or pick its ends (Välj själv). */
const TABS = [
  { id: "draw", name: "Slumpa" },
  { id: "pick", name: "Välj själv" },
] as const;

export type TripChoiceTab = (typeof TABS)[number]["id"];

/** A tab's id; `idPrefix` keeps the ids unique on the page. */
export const tripChoiceTabId = (idPrefix: string, tab: TripChoiceTab) => `${idPrefix}-tab-${tab}`;
/** A tab's panel's id. */
export const tripChoicePanelId = (idPrefix: string, tab: TripChoiceTab) =>
  `${idPrefix}-panel-${tab}`;

/**
 * The Slumpa / Välj själv tab row, following the WAI-ARIA tabs pattern: arrow keys, Home and End
 * move between tabs. The panels are the caller's, with the ids `tripChoicePanelId` gives.
 */
export function TripChoiceTabs({
  idPrefix,
  selected,
  onSelect,
}: {
  idPrefix: string;
  selected: TripChoiceTab;
  onSelect: (tab: TripChoiceTab) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const onKeyDown = (event: KeyboardEvent) => {
    const current = TABS.findIndex(({ id }) => id === selected);
    const next = {
      ArrowRight: current + 1,
      ArrowLeft: current - 1,
      Home: 0,
      End: TABS.length - 1,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const target = TABS[(next + TABS.length) % TABS.length];
    onSelect(target.id);
    list.current?.querySelector<HTMLElement>(`#${tripChoiceTabId(idPrefix, target.id)}`)?.focus();
  };

  return (
    <div
      ref={list}
      role="tablist"
      aria-label="Välj resa"
      className="free-play-tabs"
      onKeyDown={onKeyDown}
    >
      {TABS.map(({ id, name }) => (
        <button
          key={id}
          type="button"
          role="tab"
          id={tripChoiceTabId(idPrefix, id)}
          aria-selected={id === selected}
          aria-controls={tripChoicePanelId(idPrefix, id)}
          tabIndex={id === selected ? 0 : -1}
          onClick={() => onSelect(id)}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

/**
 * The Välj själv panel: Start and Mål, each tagging the other end `samma` and its neighbors
 * `granne`, the distance once both are set, and a button that takes the trip only when it can
 * be played. `clearOnPick` empties the fields after, for picking one trip after another.
 * `initial` fills the fields with a pair to begin with.
 */
export function PickTripForm({
  graph,
  idPrefix,
  hidden,
  submitLabel,
  clearOnPick = false,
  initial,
  onPick,
}: {
  graph: GraphVersion;
  idPrefix: string;
  hidden: boolean;
  submitLabel: string;
  clearOnPick?: boolean;
  initial?: Trip;
  onPick: (trip: Trip) => void;
}) {
  const nameOf = (code?: KommunCode) => (code && graph.kommuner.get(code)?.name) ?? "";
  const [startText, setStartText] = useState(() => nameOf(initial?.start));
  const [destinationText, setDestinationText] = useState(() => nameOf(initial?.destination));
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

  return (
    <form
      id={tripChoicePanelId(idPrefix, "pick")}
      role="tabpanel"
      aria-labelledby={tripChoiceTabId(idPrefix, "pick")}
      className="free-play-panel"
      hidden={hidden}
      onSubmit={(event) => {
        event.preventDefault();
        if (picked === undefined) return;
        onPick(picked.trip);
        if (clearOnPick) {
          setStartText("");
          setDestinationText("");
        }
      }}
    >
      <EndpointField
        id={`${idPrefix}-start`}
        label="Start"
        end="start"
        text={startText}
        suggestions={endpointSuggestions(graph, startText, destination)}
        onTextChange={setStartText}
      />
      <EndpointField
        id={`${idPrefix}-destination`}
        label="Mål"
        end="destination"
        text={destinationText}
        suggestions={endpointSuggestions(graph, destinationText, start)}
        onTextChange={setDestinationText}
      />
      <p className="free-play-distance" aria-live="polite">
        {picked !== undefined ? `Avstånd ${picked.distance}` : problem}
      </p>
      <button type="submit" className="free-play-go" disabled={picked === undefined}>
        {submitLabel}
      </button>
    </form>
  );
}
