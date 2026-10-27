import { type ReactNode, useId, useState } from "react";
import type { Trip } from "../engine/game";
import type { DistanceRange } from "../freePlay/draw";
import type { ModeSetting } from "../freePlay/linkPayload";
import type { SetupChoice } from "../freePlay/setupChoice";
import type { GraphVersion } from "../graph/graphVersion";
import { DistanceRangeSlider } from "./DistanceRangeSlider";
import { ModeCards, ThinkingTimeField } from "./ModeCards";
import {
  PickTripForm,
  type TripChoiceTab,
  TripChoiceTabs,
  tripChoicePanelId,
  tripChoiceTabId,
} from "./TripChoice";
import "./TripSetup.css";

/** A setup choice's mode as a trip takes it: Tidspress with its betänketid. */
export function chosenMode({ mode, thinkingTime }: SetupChoice): ModeSetting {
  return mode === "timed" ? { kind: "timed", thinkingTime } : { kind: mode };
}

/**
 * How a trip is set up, wherever one is: the Läge cards, Tidspress's betänketid in its own row
 * under them, and the Slumpa / Välj själv tabs, Slumpa with its distance range. It opens on
 * `initial` and reports each change through `onChange`; keeping the choice is the caller's. With
 * `initialPair`, it opens on Välj själv, filled with that pair. Its names and ids are its own, so
 * two can be on the page at once.
 */
export function TripSetup({
  graph,
  largest,
  initial,
  initialPair,
  onChange,
  shortDescriptions = false,
  drawActions,
  pickLabel,
  onPick,
}: {
  graph: GraphVersion;
  /** The largest distance in the version, the distance range's top. */
  largest: number;
  initial: SetupChoice;
  initialPair?: Trip;
  onChange: (choice: SetupChoice) => void;
  /** Each mode's short text instead of its full description, where room is tight. */
  shortDescriptions?: boolean;
  /** What follows the distance range on the Slumpa tab, such as its button. */
  drawActions?: ReactNode;
  /** The Välj själv tab's button. */
  pickLabel: string;
  onPick: (trip: Trip) => void;
}) {
  const idPrefix = `setup-${useId().replace(/[^\w-]/g, "")}`;
  const [choice, setChoice] = useState(initial);
  const [tab, setTab] = useState<TripChoiceTab>(initialPair ? "pick" : "draw");
  const change = (changes: Partial<SetupChoice>) => {
    const next = { ...choice, ...changes };
    setChoice(next);
    onChange(next);
  };
  const changeMode = (next: ModeSetting) =>
    change(
      next.kind === "timed"
        ? { mode: next.kind, thinkingTime: next.thinkingTime }
        : { mode: next.kind },
    );
  return (
    <>
      <ModeCards
        name={`${idPrefix}-mode`}
        mode={chosenMode(choice)}
        thinkingTime={choice.thinkingTime}
        shortDescriptions={shortDescriptions}
        onChange={changeMode}
      />
      {choice.mode === "timed" && (
        <div className="trip-setup-thinking-time">
          <ThinkingTimeField
            id={`${idPrefix}-thinking-time`}
            seconds={choice.thinkingTime}
            onChange={(seconds) => change({ thinkingTime: seconds })}
          />
        </div>
      )}
      <TripChoiceTabs idPrefix={idPrefix} selected={tab} onSelect={setTab} />
      <div
        id={tripChoicePanelId(idPrefix, "draw")}
        role="tabpanel"
        aria-labelledby={tripChoiceTabId(idPrefix, "draw")}
        className="free-play-panel"
        hidden={tab !== "draw"}
      >
        <DistanceRangeSlider
          range={choice.range}
          largest={largest}
          onChange={(range: DistanceRange) => change({ range })}
        />
        {drawActions}
      </div>
      <PickTripForm
        graph={graph}
        idPrefix={idPrefix}
        hidden={tab !== "pick"}
        submitLabel={pickLabel}
        initial={initialPair}
        onPick={onPick}
      />
    </>
  );
}
