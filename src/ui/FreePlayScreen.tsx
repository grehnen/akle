import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { type Clock, systemClock } from "../engine/clock";
import { type Game, newGame, reviewGame, type Trip } from "../engine/game";
import { tripScore } from "../engine/score";
import { timeoutRuns } from "../engine/thinkingTime";
import { stampThinkingTime, startTime, stopTimeAtWin, tripTime } from "../engine/tripTime";
import {
  defaultDistanceRange,
  type DistanceRange,
  drawTrip,
  largestDistance,
  tripPairs,
} from "../freePlay/draw";
import { endpointSuggestions, pickedTrip, resolveEndpoint } from "../freePlay/endpoints";
import type { LinkedTrip, ModeSetting } from "../freePlay/linkPayload";
import { DEFAULT_THINKING_TIME, freePlayRules, opensAtStarta } from "../freePlay/modeRules";
import { freePlayShareText } from "../freePlay/shareText";
import { tripLinkPath } from "../freePlay/tripLink";
import { saveTripSlot } from "../freePlay/tripSlot";
import type { GraphVersion } from "../graph/graphVersion";
import { emojiLine } from "../progress/history";
import { gameOutcome } from "../progress/outcome";
import type { KeyValueStorage } from "../progress/storage";
import { DistanceRangeSlider } from "./DistanceRangeSlider";
import { EndpointField } from "./EndpointField";
import { ModeCards } from "./ModeCards";
import { modeName, scoreText, timeText } from "./messages";
import { ShareButton } from "./ShareButton";
import { StartGate } from "./StartGate";
import { TripBoard } from "./TripBoard";
import { ThinkingTimeBar } from "./ThinkingTimeBar";
import { TripClock } from "./TripClock";
import { useNow } from "./useNow";
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
      trip={played.trip}
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

function FreePlayBoard({
  graph,
  trip,
  game,
  link,
  label,
  clock,
  focusGuessOnOpen,
  onGameChange,
  sessionStorage,
  resultActions,
}: {
  graph: GraphVersion;
  trip: LinkedTrip;
  game: Game;
  link: string;
  label: ReactNode;
  clock: Clock;
  focusGuessOnOpen: boolean;
  onGameChange: (game: Game) => void;
  sessionStorage: KeyValueStorage;
  resultActions: ReactNode;
}) {
  const review = useMemo(() => reviewGame(graph, game), [graph, game]);
  // A timed trip's thinking time runs on real time, read again on each tick while it's played.
  const timed = game.rules.thinkingTime !== undefined;
  const thinking = timed && review.status === "playing";
  const now = useNow(clock, thinking);
  const score = tripScore(review);
  const outcome = gameOutcome(review);
  const time = tripTime(game);
  const share =
    score !== undefined && outcome !== undefined
      ? freePlayShareText({
          mode: trip.mode,
          outcome,
          score,
          time,
          emojiLine: emojiLine(review.cards),
          link,
        })
      : undefined;
  const scoreAndShare = score !== undefined && share !== undefined && (
    <>
      <p className="result-score">{scoreText(score)}</p>
      {game.rules.keepsTime && <ResultTime time={time} />}
      <ShareButton text={share} />
    </>
  );
  return (
    <TripBoard
      graph={graph}
      game={game}
      onGameChange={onGameChange}
      sessionStorage={sessionStorage}
      label={label}
      clock={
        game.rules.keepsTime ? (
          <TripClock game={game} clock={clock} />
        ) : (
          thinking && <ThinkingTimeBar game={game} now={now} />
        )
      }
      timeouts={timed ? timeoutRuns(game, now) : undefined}
      focusGuessOnOpen={focusGuessOnOpen}
      resultActions={
        <>
          {scoreAndShare}
          {resultActions}
        </>
      }
      stripActions={scoreAndShare}
    />
  );
}

/** A tie-breaker trip's time in the result: a win's to tenths, or `–` for a loss, which has none. */
function ResultTime({ time }: { time?: number }) {
  return (
    <p className="result-time">
      Tid{" "}
      {time === undefined ? (
        <>
          <span aria-hidden="true">–</span>
          <span className="visually-hidden">saknas, bara en vinst får tid</span>
        </>
      ) : (
        timeText(time)
      )}
    </p>
  );
}

const SETUP_TABS = [
  { id: "draw", name: "Slumpa" },
  { id: "pick", name: "Välj själv" },
] as const;

type SetupTab = (typeof SETUP_TABS)[number]["id"];

const tabId = (tab: SetupTab) => `free-play-tab-${tab}`;
const panelId = (tab: SetupTab) => `free-play-panel-${tab}`;

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
  const [tab, setTab] = useState<SetupTab>("draw");
  return (
    <section className="free-play-setup" aria-labelledby="free-play-heading">
      <h2 id="free-play-heading">Fri resa</h2>
      <ModeCards mode={mode} thinkingTime={thinkingTime} onChange={onModeChange} />
      <SetupTabs selected={tab} onSelect={setTab} />
      <div
        id={panelId("draw")}
        role="tabpanel"
        aria-labelledby={tabId("draw")}
        className="free-play-panel"
        hidden={tab !== "draw"}
      >
        <DistanceRangeSlider range={range} largest={largest} onChange={onRangeChange} />
        <button type="button" className="free-play-go free-play-draw" onClick={onDraw}>
          <span aria-hidden="true">🎲</span> Slumpa resa
        </button>
        <p className="free-play-note">Start och mål visas när resan börjar.</p>
      </div>
      <PickPanel graph={graph} hidden={tab !== "pick"} onPick={onPick} />
    </section>
  );
}

/** The tab row, following the WAI-ARIA tabs pattern: arrow keys, Home and End move between tabs. */
function SetupTabs({
  selected,
  onSelect,
}: {
  selected: SetupTab;
  onSelect: (tab: SetupTab) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const onKeyDown = (event: KeyboardEvent) => {
    const current = SETUP_TABS.findIndex(({ id }) => id === selected);
    const next = {
      ArrowRight: current + 1,
      ArrowLeft: current - 1,
      Home: 0,
      End: SETUP_TABS.length - 1,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const target = SETUP_TABS[(next + SETUP_TABS.length) % SETUP_TABS.length];
    onSelect(target.id);
    list.current?.querySelector<HTMLElement>(`#${tabId(target.id)}`)?.focus();
  };

  return (
    <div
      ref={list}
      role="tablist"
      aria-label="Välj resa"
      className="free-play-tabs"
      onKeyDown={onKeyDown}
    >
      {SETUP_TABS.map(({ id, name }) => (
        <button
          key={id}
          type="button"
          role="tab"
          id={tabId(id)}
          aria-selected={id === selected}
          aria-controls={panelId(id)}
          tabIndex={id === selected ? 0 : -1}
          onClick={() => onSelect(id)}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

function PickPanel({
  graph,
  hidden,
  onPick,
}: {
  graph: GraphVersion;
  hidden: boolean;
  onPick: (trip: Trip) => void;
}) {
  const [startText, setStartText] = useState("");
  const [destinationText, setDestinationText] = useState("");
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
      id={panelId("pick")}
      role="tabpanel"
      aria-labelledby={tabId("pick")}
      className="free-play-panel"
      hidden={hidden}
      onSubmit={(event) => {
        event.preventDefault();
        if (picked) onPick(picked.trip);
      }}
    >
      <EndpointField
        id="free-play-start"
        label="Start"
        end="start"
        text={startText}
        suggestions={endpointSuggestions(graph, startText, destination)}
        onTextChange={setStartText}
      />
      <EndpointField
        id="free-play-destination"
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
        Res
      </button>
    </form>
  );
}
