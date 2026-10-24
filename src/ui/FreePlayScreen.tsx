import { useEffect, useMemo, useState } from "react";
import { type Clock, systemClock } from "../engine/clock";
import { type Game, newGame, type Trip } from "../engine/game";
import { stampThinkingTime, startTime, stopTimeAtWin } from "../engine/tripTime";
import {
  defaultDistanceRange,
  type DistanceRange,
  drawTrip,
  largestDistance,
  tripPairs,
} from "../freePlay/draw";
import type { LinkedTrip, ModeSetting } from "../freePlay/linkPayload";
import { DEFAULT_THINKING_TIME, freePlayRules, opensAtStarta } from "../freePlay/modeRules";
import { tripLinkPath } from "../freePlay/tripLink";
import { saveTripSlot } from "../freePlay/tripSlot";
import type { GraphVersion } from "../graph/graphVersion";
import type { KeyValueStorage } from "../progress/storage";
import { DistanceRangeSlider } from "./DistanceRangeSlider";
import { FreePlayBoard } from "./FreePlayBoard";
import { ModeCards } from "./ModeCards";
import { modeName } from "./messages";
import { StartGate } from "./StartGate";
import {
  PickTripForm,
  type TripChoiceTab,
  TripChoiceTabs,
  tripChoicePanelId,
  tripChoiceTabId,
} from "./TripChoice";
import "./FreePlayScreen.css";

/**
 * Shows a trip's link, `/fri?r=…`, in the address bar while the trip is played. `replace` asks
 * for it to stand in for the current address, as for a trip resumed on `/fri`.
 */
export type ShowTripLink = (link: string, replace?: boolean) => void;

/** The stored game of a trip opened again, and whether it was drawn. */
export type ResumedTrip = { game: Game; drawn: boolean };

type FreePlayScreenProps = {
  /** The version trips are played on: the current one, or the one a trip link pins. */
  graph: GraphVersion;
  /** The version's ordinal, which a trip's link pins it by. */
  ordinal: number;
  /** A trip link's or the stored trip's trip, played at once instead of the setup screen. */
  linkedTrip?: LinkedTrip;
  /** The linked trip's game, when it is the stored trip, picked up where it was left. */
  resumed?: ResumedTrip;
  onShowTripLink?: ShowTripLink;
  /** Where the trip slot is kept, the only free-play record. */
  storage: KeyValueStorage;
  /** For the board's view choices, such as the result tab. */
  sessionStorage: KeyValueStorage;
  /** What a trip's time is read from; the system clock by default. */
  clock?: Clock;
};

/**
 * The trip on the board, and whether it was drawn, which lets its result draw another. `opened`
 * marks the trip the screen opened with, from a link or the slot, rather than one started here.
 * `started` is false while a trip on the clock waits behind `Starta`, its ends still hidden.
 */
type Played = {
  trip: LinkedTrip;
  game: Game;
  drawn: boolean;
  count: number;
  opened: boolean;
  started: boolean;
};

/**
 * Free play: the Fri resa setup screen, or a trip link's or the stored trip, then the drawn,
 * picked or linked trip on the board in its mode, with its score and share text in the
 * result. The trip on the board is kept in the trip slot; nothing here touches daily progress.
 */
export function FreePlayScreen({
  graph,
  ordinal,
  linkedTrip,
  resumed,
  onShowTripLink = () => {},
  storage,
  sessionStorage,
  clock = systemClock,
}: FreePlayScreenProps) {
  const pairs = useMemo(() => tripPairs(graph), [graph]);
  const largest = largestDistance(pairs);
  const [range, setRange] = useState(() => defaultDistanceRange(largest));
  const [mode, setMode] = useState<ModeSetting>({ kind: "standard" });
  // Kept apart from the mode, so choosing another mode and Tidspress again keeps it.
  const [thinkingTime, setThinkingTime] = useState(DEFAULT_THINKING_TIME);
  const changeMode = (next: ModeSetting) => {
    setMode(next);
    if (next.kind === "timed") setThinkingTime(next.thinkingTime);
  };
  const [played, setPlayed] = useState<Played | undefined>(
    () =>
      linkedTrip && {
        trip: linkedTrip,
        game: resumed?.game ?? newGame(linkedTrip, freePlayRules(linkedTrip.mode)),
        drawn: resumed?.drawn ?? false,
        count: 1,
        opened: true,
        // A stored trip already started; it never waits behind Starta again.
        started: resumed !== undefined || !opensAtStarta(linkedTrip.mode),
      },
  );
  const link = played && tripLinkPath(ordinal, played.trip);
  const opened = played?.opened ?? false;

  useEffect(() => {
    if (link !== undefined) onShowTripLink(link, opened);
  }, [link, opened, onShowTripLink]);

  // A trip takes the slot as it starts, when the board first shows its ends (at Starta for a
  // trip on the clock), and keeps it up to date as it is played.
  useEffect(() => {
    if (played === undefined || !played.started) return;
    const { trip, game, drawn } = played;
    saveTripSlot(storage, { versionOrdinal: ordinal, trip, game, drawn });
  }, [storage, ordinal, played]);

  const play = (picked: Trip, tripMode: ModeSetting, drawn: boolean) =>
    setPlayed((last) => {
      const trip = { ...picked, mode: tripMode };
      return {
        trip,
        game: newGame(picked, freePlayRules(trip.mode)),
        drawn,
        count: (last?.count ?? 0) + 1,
        opened: false,
        started: !opensAtStarta(tripMode),
      };
    });
  const draw = (tripMode: ModeSetting, previous?: Trip) => {
    const trip = drawTrip(pairs, range, Math.random, previous);
    if (trip) play(trip, tripMode, true);
  };

  if (played === undefined || link === undefined) {
    return (
      <FreePlaySetup
        graph={graph}
        mode={mode}
        thinkingTime={thinkingTime}
        onModeChange={changeMode}
        range={range}
        largest={largest}
        onRangeChange={setRange}
        onDraw={() => draw(mode)}
        onPick={(trip) => play(trip, mode, false)}
      />
    );
  }
  const label = <p className="trip-number">Fri resa · {modeName(played.trip.mode)}</p>;
  if (!played.started) {
    return (
      <StartGate
        key={played.count}
        label={label}
        onStart={() =>
          setPlayed({ ...played, started: true, game: startTime(played.game, clock()) })
        }
      />
    );
  }
  return (
    <FreePlayBoard
      // A new trip gets a fresh board, so the last one's result state doesn't carry over.
      key={played.count}
      graph={graph}
      mode={played.trip.mode}
      game={played.game}
      link={link}
      label={label}
      clock={clock}
      // Started here just now, behind Starta, so the player can type at once.
      focusGuessOnOpen={opensAtStarta(played.trip.mode) && played.game.guesses.length === 0}
      onGameChange={(game) => {
        const now = clock();
        const stamped = stampThinkingTime(graph, stopTimeAtWin(graph, game, now), now);
        setPlayed({ ...played, game: stamped });
      }}
      sessionStorage={sessionStorage}
      resultActions={
        played.drawn && (
          <button
            type="button"
            className="free-play-redraw"
            onClick={() => draw(played.trip.mode, played.game.trip)}
          >
            Slumpa ny resa
          </button>
        )
      }
    />
  );
}

const ID_PREFIX = "free-play";

function FreePlaySetup({
  graph,
  mode,
  thinkingTime,
  onModeChange,
  range,
  largest,
  onRangeChange,
  onDraw,
  onPick,
}: {
  graph: GraphVersion;
  mode: ModeSetting;
  thinkingTime: number;
  onModeChange: (mode: ModeSetting) => void;
  range: DistanceRange;
  largest: number;
  onRangeChange: (range: DistanceRange) => void;
  onDraw: () => void;
  onPick: (trip: Trip) => void;
}) {
  const [tab, setTab] = useState<TripChoiceTab>("draw");
  return (
    <section className="free-play-setup" aria-labelledby="free-play-heading">
      <h2 id="free-play-heading">Fri resa</h2>
      <ModeCards mode={mode} thinkingTime={thinkingTime} onChange={onModeChange} />
      <TripChoiceTabs idPrefix={ID_PREFIX} selected={tab} onSelect={setTab} />
      <div
        id={tripChoicePanelId(ID_PREFIX, "draw")}
        role="tabpanel"
        aria-labelledby={tripChoiceTabId(ID_PREFIX, "draw")}
        className="free-play-panel"
        hidden={tab !== "draw"}
      >
        <DistanceRangeSlider range={range} largest={largest} onChange={onRangeChange} />
        <button type="button" className="free-play-go free-play-draw" onClick={onDraw}>
          <span aria-hidden="true">🎲</span> Slumpa resa
        </button>
        <p className="free-play-note">Start och mål visas när resan börjar.</p>
      </div>
      <PickTripForm
        graph={graph}
        idPrefix={ID_PREFIX}
        hidden={tab !== "pick"}
        submitLabel="Res"
        onPick={onPick}
      />
    </section>
  );
}
