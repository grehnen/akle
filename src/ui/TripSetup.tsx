import { type ReactNode, useId } from "react";
import type { Trip } from "../engine/game";
import type { DistanceRange } from "../freePlay/draw";
import type { ModeSetting } from "../freePlay/linkPayload";
import { chosenMode, type SetupChoice } from "../freePlay/setupChoice";
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

/**
 * How a trip is set up, wherever one is: the Läge cards, Tidspress's betänketid in its own row
 * under them, and the Slumpa / Välj själv tabs, Slumpa with its distance range. It shows the
 * `choice` and the selected `tab` and reports each change; keeping both is the caller's. Välj
 * själv opens filled with `initialPair`. Its names and ids are its own, so two can be on the page
 * at once.
 */
export function TripSetup({
  graph,
  largest,
  choice,
  onChange,
  tab,
  onTabChange,
  initialPair,
  shortDescriptions = false,
  drawActions,
  pickLabel,
  onPick,
  onPickedChange,
}: {
  graph: GraphVersion;
  /** The largest distance in the version, the distance range's top. */
  largest: number;
  choice: SetupChoice;
  onChange: (choice: SetupChoice) => void;
  tab: TripChoiceTab;
  onTabChange: (tab: TripChoiceTab) => void;
  /** The pair Välj själv opens filled with. */
  initialPair?: Trip;
  /** Each mode's short text instead of its full description, where room is tight. */
  shortDescriptions?: boolean;
  /** What follows the distance range on the Slumpa tab, such as its button. */
  drawActions?: ReactNode;
  /** The Välj själv tab's button; without one, the caller adds the picked trip its own way. */
  pickLabel?: string;
  onPick?: (trip: Trip) => void;
  /** Told Välj själv's trip whenever it changes: undefined until it can be played. */
  onPickedChange?: (trip: Trip | undefined) => void;
}) {
  const idPrefix = `setup-${useId().replace(/[^\w-]/g, "")}`;
  const change = (changes: Partial<SetupChoice>) => onChange({ ...choice, ...changes });
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
      <TripChoiceTabs idPrefix={idPrefix} selected={tab} onSelect={onTabChange} />
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
        onPickedChange={onPickedChange}
      />
    </>
  );
}
