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
import { SITE_URL } from "../siteUrl";
import { CopyLinkButton } from "./CopyLinkButton";
import { GatedBoard } from "./GatedBoard";
import { ItinerarySummaryView } from "./ItinerarySummary";
import { MODE_NAMES, modeDescription, modeName, SCORE_EXPLANATION, scoreText } from "./messages";
import { ModeDot } from "./ModeDot";
import { ScoreTooltip } from "./ScoreTooltip";
import { useNavigation } from "./navigation";
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
}: ItineraryScreenProps) {
  const [play, setPlay] = useState<ItineraryPlay>(initialPlay);
  const { arrivedInApp } = useNavigation();
  // Whether the player has moved the itinerary on here, rather than it standing where it opened.
  const [movedOnHere, setMovedOnHere] = useState(false);
  const moveOn = (change: (current: ItineraryPlay) => ItineraryPlay) => {
    setMovedOnHere(true);
    setPlay(change);
  };
  useEffect(() => onPlayChange?.(play), [play, onPlayChange]);
  const stage = itineraryStage(graph, trips, play);
  const total = itineraryTotal(graph, play);
  // The board a trip's card loads behind its Starta, until the trip starts.
  const cardTrip = stage.kind === "card" ? trips[stage.index] : undefined;
  const cardGame = useMemo(() => cardTrip && unstartedGame(cardTrip), [cardTrip]);

  if (stage.kind === "intro") {
    return (
      <ItineraryIntro
        title={title}
        trips={trips}
        url={`${SITE_URL}${link}`}
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
      <span className="itinerary-progress-title">{title ?? "Resplan"}</span>{" "}
      <span className="itinerary-progress-detail">
        Resa {stage.index + 1} av {trips.length} · <ModeDot kind={trip.mode.kind} />
        {modeName(trip.mode)} · <ScoreTooltip>Totalt {scoreText(total)}</ScoreTooltip>
      </span>
    </p>
  );
  const onCard = stage.kind === "card";
  const game = onCard ? cardGame : stage.game;
  if (game === undefined) return null;
  const over = !onCard && stage.over;
  const last = stage.index === trips.length - 1;
  const tripEnd = over && (
    <button
      type="button"
      className="itinerary-next"
      onClick={() => moveOn((current) => nextTrip(graph, trips, current, clock()))}
    >
      {last ? "Visa sammanfattning →" : "Nästa resa"}
    </button>
  );
  // A trip's card is its board's Starta gate.
  return (
    <GatedBoard
      // Each trip gets a fresh card, its Starta focused, and a fresh board, so the last one's
      // result state doesn't carry over.
      key={stage.index}
      gate={
        onCard
          ? {
              onTheClock: opensAtStarta(trip.mode),
              onStart: () => moveOn((current) => startTrip(trips, current, clock())),
            }
          : undefined
      }
      graph={graph}
      mode={trip.mode}
      game={game}
      label={label}
      clock={clock}
      // Put on the board by the player, here or by a link within the app, so they can type at once.
      openedByPlayer={movedOnHere || arrivedInApp}
      onGameChange={(changed) =>
        setPlay((current) => changeTripGame(graph, current, changed, clock()))
      }
      sessionStorage={sessionStorage}
      resultActions={tripEnd}
      stripActions={tripEnd}
    />
  );
}

/**
 * The itinerary's intro, in two columns on a wide screen: its title, how it's played and scored
 * and its actions, beside its trips as a route, ends hidden, with each mode played explained once
 * in a legend below. On a phone it's one column, the actions last.
 */
function ItineraryIntro({
  title,
  trips,
  url,
  onBegin,
}: {
  title?: string;
  trips: readonly LinkedTrip[];
  /** The itinerary's link in full, for Kopiera länk. */
  url: string;
  onBegin: () => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => button.current?.focus(), []);
  const [fallbackTarget, setFallbackTarget] = useState<HTMLDivElement | null>(null);
  const modesPlayed = [...new Set(trips.map((trip) => trip.mode.kind))];
  return (
    <section className="itinerary-intro" aria-labelledby="itinerary-intro-heading">
      <div className="itinerary-intro-side">
        <p className="itinerary-intro-eyebrow">Resplan · {trips.length} resor</p>
        <h2 id="itinerary-intro-heading">{title ?? "Resplan"}</h2>
        <p className="itinerary-intro-note">
          Start och mål visas resa för resa. Varje resa spelas en gång, i tur och ordning.
        </p>
        <p className="itinerary-intro-score">{SCORE_EXPLANATION}</p>
        <div className="itinerary-intro-actions">
          <div className="itinerary-intro-buttons">
            <CopyLinkButton url={url} fallbackTarget={fallbackTarget} />
            <button ref={button} type="button" className="itinerary-begin" onClick={onBegin}>
              Starta resplanen
            </button>
          </div>
          <div className="itinerary-intro-fallback" ref={setFallbackTarget} />
        </div>
      </div>
      <div className="itinerary-intro-main">
        <ol className="itinerary-route" aria-label="Resornas lägen">
          {trips.map((trip, index) => (
            // oxlint-disable-next-line react/no-array-index-key -- the order is fixed: a trip is its place.
            <li key={index} className="itinerary-stop">
              <span className="itinerary-stop-number" data-mode={trip.mode.kind} aria-hidden="true">
                {index + 1}
              </span>
              <strong className="itinerary-stop-mode">{modeName(trip.mode)}</strong>
              <span className="itinerary-stop-ends" aria-hidden="true">
                ? → ?
              </span>
            </li>
          ))}
        </ol>
        <dl className="itinerary-legend">
          {modesPlayed.map((kind) => (
            <div key={kind}>
              <dt>
                <span className="itinerary-legend-marker" data-mode={kind} aria-hidden="true" />
                {MODE_NAMES[kind]}
              </dt>
              <dd>{modeDescription(kind)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
