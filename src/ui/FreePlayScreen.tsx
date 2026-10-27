import { type ReactNode, useEffect, useMemo, useState } from "react";
import { type Clock, systemClock } from "../engine/clock";
import { type Game, newGame, type Trip } from "../engine/game";
import { stampThinkingTime, startTime, stopTimeAtWin } from "../engine/tripTime";
import { type DistanceRange, drawTrip, largestDistance, tripPairs } from "../freePlay/draw";
import type { LinkedTrip, ModeSetting } from "../freePlay/linkPayload";
import { freePlayRules, opensAtStarta } from "../freePlay/modeRules";
import { restoreSetupChoice, type SetupChoice, saveSetupChoice } from "../freePlay/setupChoice";
import { FREE_PLAY_PATH, tripLinkPath } from "../freePlay/tripLink";
import {
  drawnAtStarta,
  noteDrawnAtStarta,
  type ResumedTrip,
  saveTrip,
} from "../freePlay/tripSaves";
import type { GraphVersion } from "../graph/graphVersion";
import type { KeyValueStorage } from "../progress/storage";
import { AppLink } from "./AppLink";
import { GatedBoard } from "./GatedBoard";
import { guessesSoFar, modeName } from "./messages";
import { useNavigation } from "./navigation";
import { ResumeLink } from "./ResumeLink";
import { chosenMode, TripSetup } from "./TripSetup";
import "./FreePlayScreen.css";

/**
 * Shows a trip's link, `/fri?r=…`, in the address bar while the trip is played. `replace` asks
 * for it to stand in for the current address, as for a trip opened from its link.
 */
export type ShowTripLink = (link: string, replace?: boolean) => void;

/** The most recently played trip, left unfinished: what setup's way back to it names. */
export type UnfinishedTrip = {
  mode: ModeSetting;
  /** The guesses made so far. */
  guesses: number;
  /** The trip's link, which resumes it. */
  link: string;
};

type FreePlayScreenProps = {
  /** The version trips are played on: the current one, or the one a trip link pins. */
  graph: GraphVersion;
  /** The version's ordinal, which a trip's link pins it by. */
  ordinal: number;
  /** A trip link's trip, played at once instead of the setup screen. */
  linkedTrip?: LinkedTrip;
  /** The linked trip's game, when its link has a save, picked up where it was left. */
  resumed?: ResumedTrip;
  /** The most recently played trip, when unfinished, which setup offers a way back to. */
  unfinished?: UnfinishedTrip;
  onShowTripLink?: ShowTripLink;
  /** Where trips' saves are kept, the only free-play record, and setup's last choice. */
  storage: KeyValueStorage;
  /** For the board's view choices, such as the result tab. */
  sessionStorage: KeyValueStorage;
  /** What a trip's time is read from; the system clock by default. */
  clock?: Clock;
};

/**
 * The trip on the board, and whether it was drawn, with the range it was drawn from, which its
 * result draws the next from (none for a trip not drawn, or drawn and stored before ranges were
 * kept: those draw from setup's range). `startedHere` marks a trip started on this screen, from
 * setup or Slumpa ny resa, rather than the one it opened with, from a link or its save.
 * `started` is false while a trip on the clock waits behind `Starta`, its ends still hidden.
 */
type Played = {
  trip: LinkedTrip;
  game: Game;
  drawn: boolean;
  range?: DistanceRange;
  count: number;
  startedHere: boolean;
  started: boolean;
};

/**
 * Free play: the Fri resa setup screen, or a trip link's trip, then the drawn,
 * picked or linked trip on the board in its mode, with its score and share text in the
 * result, which leads on to another drawn trip in the same mode or back to setup. The trip on
 * the board is kept as its link's save; nothing here touches daily progress.
 */
export function FreePlayScreen({
  graph,
  ordinal,
  linkedTrip,
  resumed,
  unfinished,
  onShowTripLink = () => {},
  storage,
  sessionStorage,
  clock = systemClock,
}: FreePlayScreenProps) {
  const pairs = useMemo(() => tripPairs(graph), [graph]);
  const largest = largestDistance(pairs);
  // Setup opens on the choice last made in it on this device; a trip's link never changes it.
  const [choice, setChoice] = useState(() => restoreSetupChoice(storage, largest));
  const changeChoice = (next: SetupChoice) => {
    setChoice(next);
    saveSetupChoice(storage, next);
  };
  const { range } = choice;
  const mode = chosenMode(choice);
  const [played, setPlayed] = useState<Played | undefined>(() => {
    if (linkedTrip === undefined) return undefined;
    // A drawn trip behind Starta has no save yet, but may have been noted this session.
    const drawnFrom = resumed
      ? resumed.range
      : drawnAtStarta(sessionStorage, tripLinkPath(ordinal, linkedTrip));
    return {
      trip: linkedTrip,
      game: resumed?.game ?? newGame(linkedTrip, freePlayRules(linkedTrip.mode)),
      drawn: resumed?.drawn ?? drawnFrom !== undefined,
      range: drawnFrom,
      count: 1,
      startedHere: false,
      // A stored trip already started; it never waits behind Starta again.
      started: resumed !== undefined || !opensAtStarta(linkedTrip.mode),
    };
  });
  const link = played && tripLinkPath(ordinal, played.trip);
  const startedHere = played?.startedHere ?? false;
  const { arrivedInApp } = useNavigation();

  // A trip opened from its link keeps its address; one started here gets its own.
  useEffect(() => {
    if (link !== undefined) onShowTripLink(link, !startedHere);
  }, [link, startedHere, onShowTripLink]);

  useEffect(() => {
    if (played === undefined || played.started || played.range === undefined) return;
    noteDrawnAtStarta(sessionStorage, tripLinkPath(ordinal, played.trip), played.range);
  }, [sessionStorage, ordinal, played]);

  // A trip gets its save as it starts, when the board first shows its ends (at Starta for a
  // trip on the clock), and keeps it up to date as it is played. A trip started here from setup
  // or Slumpa ny resa is a new game, so it replaces any save its link had.
  useEffect(() => {
    if (played === undefined || !played.started) return;
    const { trip, game, drawn, range: drawnFrom } = played;
    saveTrip(storage, { versionOrdinal: ordinal, trip, game, drawn, range: drawnFrom });
  }, [storage, ordinal, played]);

  const play = (picked: Trip, tripMode: ModeSetting, drawnFrom?: DistanceRange) =>
    setPlayed((last) => {
      const trip = { ...picked, mode: tripMode };
      return {
        trip,
        game: newGame(picked, freePlayRules(trip.mode)),
        drawn: drawnFrom !== undefined,
        range: drawnFrom,
        count: (last?.count ?? 0) + 1,
        startedHere: true,
        started: !opensAtStarta(tripMode),
      };
    });
  const draw = (tripMode: ModeSetting, from: DistanceRange, previous?: Trip) => {
    const trip = drawTrip(pairs, from, Math.random, previous);
    if (trip) play(trip, tripMode, from);
  };

  if (played === undefined || link === undefined) {
    return (
      <FreePlaySetup
        graph={graph}
        largest={largest}
        choice={choice}
        onChoiceChange={changeChoice}
        onDraw={() => draw(mode, range)}
        onPick={(trip) => play(trip, mode)}
        resume={unfinished && <ResumeTrip unfinished={unfinished} />}
      />
    );
  }
  const label = <p className="trip-number">Fri resa · {modeName(played.trip.mode)}</p>;
  const { count, started } = played;
  return (
    <GatedBoard
      // A new trip gets a fresh gate and board, so the last one's result state doesn't carry over.
      key={count}
      gate={
        started
          ? undefined
          : {
              // Behind Starta the trip has no save yet, so leaving for setup records nothing of it.
              wayBack: (
                <AppLink className="start-gate-back" href={FREE_PLAY_PATH}>
                  ‹ Tillbaka
                </AppLink>
              ),
              onStart: () =>
                setPlayed({ ...played, started: true, game: startTime(played.game, clock()) }),
            }
      }
      graph={graph}
      mode={played.trip.mode}
      game={played.game}
      link={link}
      label={label}
      clock={clock}
      // Put on the board by the player, here or by a link within the app, so they can type at once.
      openedByPlayer={startedHere || arrivedInApp}
      onGameChange={(game) => {
        const now = clock();
        const stamped = stampThinkingTime(graph, stopTimeAtWin(graph, game, now), now);
        setPlayed({ ...played, game: stamped });
      }}
      sessionStorage={sessionStorage}
      resultActions={
        <div className="free-play-next">
          <SetupLink />
          <button
            type="button"
            className="free-play-redraw"
            onClick={() => draw(played.trip.mode, played.range ?? range, played.game.trip)}
          >
            Slumpa ny resa
          </button>
        </div>
      }
    />
  );
}

/** The way back to setup, from a trip's result or its Starta gate. */
function SetupLink() {
  return (
    <AppLink className="free-play-setup-link" href={FREE_PLAY_PATH}>
      Välj läge och resa
    </AppLink>
  );
}

function FreePlaySetup({
  graph,
  largest,
  choice,
  onChoiceChange,
  onDraw,
  onPick,
  resume,
}: {
  graph: GraphVersion;
  largest: number;
  /** The choice setup opens on. */
  choice: SetupChoice;
  onChoiceChange: (choice: SetupChoice) => void;
  onDraw: () => void;
  onPick: (trip: Trip) => void;
  /** The way back to an unfinished trip, first under the heading so it's seen without scrolling. */
  resume?: ReactNode;
}) {
  return (
    <section className="free-play-setup" aria-labelledby="free-play-heading">
      <h2 id="free-play-heading">Fri resa</h2>
      {resume}
      <TripSetup
        graph={graph}
        largest={largest}
        initial={choice}
        onChange={onChoiceChange}
        drawActions={
          <>
            <button type="button" className="free-play-go free-play-draw" onClick={onDraw}>
              <span aria-hidden="true">🎲</span> Slumpa resa
            </button>
            <p className="free-play-note">Start och mål visas när resan börjar.</p>
          </>
        }
        pickLabel="Res"
        onPick={onPick}
      />
    </section>
  );
}

/**
 * Setup's way back to the most recently played trip, unfinished, opened in place like its link.
 * Like a share text, it never names the trip's ends.
 */
function ResumeTrip({ unfinished: { mode, guesses, link } }: { unfinished: UnfinishedTrip }) {
  return (
    <ResumeLink
      className="free-play-resume"
      href={link}
      what="Oavslutad resa"
      progress={`${modeName(mode)} · ${guessesSoFar(guesses)}`}
    />
  );
}
