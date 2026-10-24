import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { type Game, newGame, reviewGame, STANDARD_RULES, type Trip } from "../engine/game";
import { tripScore } from "../engine/score";
import {
  defaultDistanceRange,
  type DistanceRange,
  drawTrip,
  largestDistance,
  tripPairs,
} from "../freePlay/draw";
import { endpointSuggestions, pickedTrip, resolveEndpoint } from "../freePlay/endpoints";
import type { LinkedTrip } from "../freePlay/linkPayload";
import { freePlayShareText } from "../freePlay/shareText";
import { tripLinkPath } from "../freePlay/tripLink";
import type { GraphVersion } from "../graph/graphVersion";
import { emojiLine } from "../progress/history";
import { gameOutcome } from "../progress/outcome";
import type { KeyValueStorage } from "../progress/storage";
import { DistanceRangeSlider } from "./DistanceRangeSlider";
import { EndpointField } from "./EndpointField";
import { modeName, scoreText } from "./messages";
import { ShareButton } from "./ShareButton";
import { TripBoard } from "./TripBoard";
import "./FreePlayScreen.css";

/** Shows a trip's link, `/fri?r=…`, in the address bar while the trip is played. */
export type ShowTripLink = (link: string) => void;

type FreePlayScreenProps = {
  /** The version trips are played on: the current one, or the one a trip link pins. */
  graph: GraphVersion;
  /** The version's ordinal, which a trip's link pins it by. */
  ordinal: number;
  /** A trip link's trip, played at once instead of the setup screen. */
  linkedTrip?: LinkedTrip;
  onShowTripLink?: ShowTripLink;
  /** For the board's view choices, such as the result tab; free play keeps no progress. */
  sessionStorage: KeyValueStorage;
};

/** The trip on the board, and whether it was drawn, which lets its result draw another. */
type Played = { trip: LinkedTrip; game: Game; drawn: boolean; count: number };

const standard = (trip: Trip): LinkedTrip => ({ ...trip, mode: { kind: "standard" } });

/**
 * Free play: the Fri resa setup screen, or a trip link's trip, then the drawn, picked or linked
 * trip on the board in standard mode, with its score and share text in the result. Nothing here
 * reads or writes daily progress.
 */
export function FreePlayScreen({
  graph,
  ordinal,
  linkedTrip,
  onShowTripLink = () => {},
  sessionStorage,
}: FreePlayScreenProps) {
  const pairs = useMemo(() => tripPairs(graph), [graph]);
  const largest = largestDistance(pairs);
  const [range, setRange] = useState(() => defaultDistanceRange(largest));
  const [played, setPlayed] = useState<Played | undefined>(
    () =>
      linkedTrip && {
        trip: linkedTrip,
        game: newGame(linkedTrip, STANDARD_RULES),
        drawn: false,
        count: 1,
      },
  );
  const link = played && tripLinkPath(ordinal, played.trip);

  useEffect(() => {
    if (link !== undefined) onShowTripLink(link);
  }, [link, onShowTripLink]);

  const play = (trip: Trip, drawn: boolean) =>
    setPlayed((last) => ({
      trip: standard(trip),
      game: newGame(trip, STANDARD_RULES),
      drawn,
      count: (last?.count ?? 0) + 1,
    }));
  const draw = (previous?: Trip) => {
    const trip = drawTrip(pairs, range, Math.random, previous);
    if (trip) play(trip, true);
  };

  if (played === undefined || link === undefined) {
    return (
      <FreePlaySetup
        graph={graph}
        range={range}
        largest={largest}
        onRangeChange={setRange}
        onDraw={() => draw()}
        onPick={(trip) => play(trip, false)}
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
      onGameChange={(game) => setPlayed({ ...played, game })}
      sessionStorage={sessionStorage}
      resultActions={
        played.drawn && (
          <button type="button" className="free-play-redraw" onClick={() => draw(played.game.trip)}>
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
  onGameChange,
  sessionStorage,
  resultActions,
}: {
  graph: GraphVersion;
  trip: LinkedTrip;
  game: Game;
  link: string;
  onGameChange: (game: Game) => void;
  sessionStorage: KeyValueStorage;
  resultActions: ReactNode;
}) {
  const review = useMemo(() => reviewGame(graph, game), [graph, game]);
  const score = tripScore(review);
  const outcome = gameOutcome(review);
  const share =
    score !== undefined && outcome !== undefined
      ? freePlayShareText({
          mode: trip.mode,
          outcome,
          score,
          emojiLine: emojiLine(review.cards),
          link,
        })
      : undefined;
  const scoreAndShare = score !== undefined && share !== undefined && (
    <>
      <p className="result-score">{scoreText(score)}</p>
      <ShareButton text={share} />
    </>
  );
  return (
    <TripBoard
      graph={graph}
      game={game}
      onGameChange={onGameChange}
      sessionStorage={sessionStorage}
      label={<p className="trip-number">Fri resa · {modeName(trip.mode)}</p>}
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

const SETUP_TABS = [
  { id: "draw", name: "Slumpa" },
  { id: "pick", name: "Välj själv" },
] as const;

type SetupTab = (typeof SETUP_TABS)[number]["id"];

const tabId = (tab: SetupTab) => `free-play-tab-${tab}`;
const panelId = (tab: SetupTab) => `free-play-panel-${tab}`;

function FreePlaySetup({
  graph,
  range,
  largest,
  onRangeChange,
  onDraw,
  onPick,
}: {
  graph: GraphVersion;
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
