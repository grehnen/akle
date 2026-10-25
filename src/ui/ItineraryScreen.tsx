import { useEffect, useMemo, useRef, useState } from "react";
import { type Clock, systemClock } from "../engine/clock";
import {
  beginItinerary,
  changeTripGame,
  type ItineraryPlay,
  itineraryStage,
  itineraryTotal,
  NEW_ITINERARY_PLAY,
  nextTrip,
  startTrip,
  unstartedGame,
} from "../freePlay/itineraryPlay";
import { itinerarySummary } from "../freePlay/itinerarySummary";
import type { LinkedTrip } from "../freePlay/linkPayload";
import { opensAtStarta } from "../freePlay/modeRules";
import type { GraphVersion } from "../graph/graphVersion";
import type { KeyValueStorage } from "../progress/storage";
import { FreePlayBoard } from "./FreePlayBoard";
import { ItinerarySummaryView } from "./ItinerarySummary";
import { modeName, scoreText } from "./messages";
import { StartGate } from "./StartGate";
import "./ItineraryScreen.css";

type ItineraryScreenProps = {
  /** The version the itinerary's link pins, every trip played on it. */
  graph: GraphVersion;
  title?: string;
  trips: readonly LinkedTrip[];
  /** The itinerary's link, `/resplan?namn=…&r=…`, shared from its summary. */
  link: string;
  /** For the board's view choices, such as the result tab. */
  sessionStorage: KeyValueStorage;
  /** What a trip's time is read from; the system clock by default. */
  clock?: Clock;
  /** Where the itinerary stands when it opens, its intro by default. */
  initialPlay?: ItineraryPlay;
  /** Told where the itinerary stands whenever that changes, from the start. */
  onPlayChange?: (play: ItineraryPlay) => void;
  /** Opened by a link within the app, not by loading the page: see `ItineraryView`. */
  openedInApp?: boolean;
};

/**
 * An itinerary played from its link: its intro, then for each trip in order a card with
 * `Starta` if it's on the clock, the trip in its own mode and its result with `Nästa resa`, and
 * after the last its summary, shared with its `link`. Every trip screen is labelled with the
 * itinerary's title, the trip's place and the running total. One attempt per trip, no skip or
 * retry; nothing here touches trips' saves or daily progress.
 */
export function ItineraryScreen({
  graph,
  title,
  trips,
  link,
  sessionStorage,
  clock = systemClock,
  initialPlay = NEW_ITINERARY_PLAY,
  onPlayChange,
  openedInApp = false,
}: ItineraryScreenProps) {
  const [play, setPlay] = useState<ItineraryPlay>(initialPlay);
  // Whether the player has moved the itinerary on here, or came to it by a link within the app,
  // rather than arriving where it stood on loading the page.
  const [movedOn, setMovedOn] = useState(openedInApp);
  const moveOn = (change: (current: ItineraryPlay) => ItineraryPlay) => {
    setMovedOn(true);
    setPlay(change);
  };
  useEffect(() => onPlayChange?.(play), [play, onPlayChange]);
  const stage = itineraryStage(graph, trips, play);
  const total = itineraryTotal(graph, play);
  // The trip, by its place, whose board's map is drawn.
  const [mapReadyFor, setMapReadyFor] = useState<number>();
  // The board a trip's card loads behind its Starta, until the trip starts.
  const cardTrip = stage.kind === "card" ? trips[stage.index] : undefined;
  const cardGame = useMemo(() => cardTrip && unstartedGame(cardTrip), [cardTrip]);

  if (stage.kind === "intro") {
    return (
      <ItineraryIntro
        title={title}
        trips={trips}
        onBegin={() => moveOn((last) => beginItinerary(trips, last, clock()))}
      />
    );
  }
  if (stage.kind === "finished") {
    const summary = itinerarySummary(graph, trips, play);
    return summary === undefined ? null : (
      <ItinerarySummaryView title={title} summary={summary} link={link} />
    );
  }

  const trip = trips[stage.index];
  const label = (
    <p className="trip-number itinerary-progress">
      {title ?? "Resplan"} · Resa {stage.index + 1} av {trips.length} · {modeName(trip.mode)} ·
      Totalt {scoreText(total)}
    </p>
  );
  const onCard = stage.kind === "card";
  const game = onCard ? cardGame : stage.game;
  if (game === undefined) return null;
  const over = !onCard && stage.over;
  const last = stage.index === trips.length - 1;
  const tripEnd = over && (
    <>
      <p className="itinerary-total">Totalt {scoreText(total)}</p>
      <button
        type="button"
        className="itinerary-next"
        onClick={() => moveOn((current) => nextTrip(graph, trips, current, clock()))}
      >
        {last ? "Avsluta resplanen" : "Nästa resa"}
      </button>
    </>
  );
  // A trip's card loads its board unseen behind Starta, which waits until its map is drawn; the
  // reveal shows that same board.
  return (
    <>
      {onCard && (
        <StartGate
          // Each card is a fresh gate, its Starta focused.
          key={`gate-${stage.index}`}
          label={label}
          ready={mapReadyFor === stage.index}
          onTheClock={opensAtStarta(trip.mode)}
          onStart={() => moveOn((current) => startTrip(trips, current, clock()))}
        />
      )}
      <FreePlayBoard
        // Each trip gets a fresh board, so the last one's result state doesn't carry over.
        key={stage.index}
        graph={graph}
        mode={trip.mode}
        game={game}
        label={label}
        clock={clock}
        concealed={onCard}
        onMapReady={() => setMapReadyFor(stage.index)}
        // Started from its card, or put on the board by the player, so they can type at once.
        openedByPlayer={onCard || movedOn}
        onGameChange={(changed) =>
          setPlay((current) => changeTripGame(graph, current, changed, clock()))
        }
        sessionStorage={sessionStorage}
        resultActions={tripEnd}
        stripActions={tripEnd}
      />
    </>
  );
}

/** The itinerary's intro: its title, its number of trips and each trip's mode, ends hidden. */
function ItineraryIntro({
  title,
  trips,
  onBegin,
}: {
  title?: string;
  trips: readonly LinkedTrip[];
  onBegin: () => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => button.current?.focus(), []);
  return (
    <section className="itinerary-intro" aria-labelledby="itinerary-intro-heading">
      <h2 id="itinerary-intro-heading">{title ?? "Resplan"}</h2>
      <p className="itinerary-intro-count">{trips.length} resor</p>
      <ol className="itinerary-intro-trips" aria-label="Resornas lägen">
        {trips.map((trip, index) => (
          // oxlint-disable-next-line react/no-array-index-key -- the order is fixed: a trip is its place.
          <li key={index}>{modeName(trip.mode)}</li>
        ))}
      </ol>
      <p className="itinerary-intro-note">
        Start och mål visas resa för resa. Varje resa spelas en gång, i tur och ordning.
      </p>
      <button ref={button} type="button" className="itinerary-begin" onClick={onBegin}>
        Starta resplanen
      </button>
    </section>
  );
}
