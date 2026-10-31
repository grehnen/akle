import {
  Fragment,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type Game, giveUp, reviewGame, type Trip } from "../engine/game";
import { hintReveals } from "../engine/hints";
import { resolveKommunName } from "../engine/kommunNames";
import { guessedStops } from "../engine/routeStops";
import { type GraphVersion, kommunName } from "../graph/graphVersion";
import { SatelliteMap } from "../map/SatelliteMap";
import type { Stats } from "../progress/stats";
import type { KeyValueStorage } from "../progress/storage";
import { Confetti, FinishGlow, REDUCED_MOTION_QUERY } from "./FinishEffect";
import { GiveUp } from "./GiveUp";
import { GuessCounter } from "./GuessCounter";
import { GuessInput } from "./GuessInput";
import { HintSection } from "./HintSection";
import { PacingContext } from "./pacing";
import {
  applyGuessInput,
  enterTarget,
  type GuessSession,
  suggestKommuner,
  takeSessionHint,
} from "./guessSession";
import { guessCardText, timeoutRowTitle, timeoutsText } from "./messages";
import { ResultStrip, type ResultScore, ResultView } from "./ResultView";

type TripBoardProps<T extends Trip> = {
  graph: GraphVersion;
  /** The game being played; the screen around the board holds it, to save or share it. */
  game: Game<T>;
  onGameChange: (game: Game<T>) => void;
  /** Where view choices that last one browser session are kept, such as the result tab. */
  sessionStorage: KeyValueStorage;
  /** Shown with the heading, such as `Dagens resa #21`. */
  label?: ReactNode;
  /** Heads the result view and its strip in place of the daily outcome, as free play does. */
  resultHeadline?: string;
  /** Added beside the outcome in the result view, such as the countdown and sharing. */
  resultActions?: ReactNode;
  /** A score for the result view's header to lay out in columns, with the detail beside it. */
  resultScore?: ResultScore;
  /** Added to the collapsed result strip, such as sharing. */
  stripActions?: ReactNode;
  /** Adds the Statistik tab to the result view. */
  stats?: Stats;
  /** Whether the finished game's result starts collapsed, as the screen remembers it. */
  resultClosed?: boolean;
  onResultClosedChange?: (closed: boolean) => void;
  /** Links put in the footer before the data credits, such as Rapportera fel. */
  footerLinks?: ReactNode;
  /** Shown above the guess input while the trip is played, such as its thinking-time bar. */
  clock?: ReactNode;
  /**
   * Laid over the map's top-left corner while the trip is played and through the pause after it
   * ends, such as a tie-breaker trip's running time; it moves nothing on the board.
   */
  mapCorner?: ReactNode;
  /**
   * The board opens by the player's own action, as after Slumpa resa or `Starta`, not on
   * arriving at the page: it takes the window to the top and focus to the guess input.
   */
  openedByPlayer?: boolean;
  /**
   * A timed trip's timeouts, as runs: before each guess, then since the last one (`timeoutRuns`).
   * Each run shows as one ⏱ row among the guesses.
   */
  timeouts?: readonly number[];
  /**
   * The board loads unseen behind a trip's `Starta`: only its map, naming no kommun, out of
   * reach of keyboard and screen reader, until the reveal shows it as it is.
   */
  concealed?: boolean;
  /** Told once when the board's map is drawn, or can't be (see `SatelliteMap`). */
  onMapReady?: () => void;
};

/**
 * Plays one trip: the heading, the map, the guess input, the past guesses, the hints, Ge upp
 * when the rules allow giving up and, once the game ends, the result view with Min rutt and
 * Kortaste rutt. Whatever only one kind of trip
 * needs, such as saving, history or a trip number, the screen around it passes in.
 */
export function TripBoard<T extends Trip>({
  graph,
  game,
  onGameChange,
  sessionStorage,
  label,
  resultHeadline,
  resultActions,
  resultScore,
  stripActions,
  stats,
  resultClosed: initiallyClosed = false,
  onResultClosedChange,
  footerLinks,
  clock,
  mapCorner,
  openedByPlayer: initiallyOpenedByPlayer = false,
  timeouts,
  concealed = false,
  onMapReady,
}: TripBoardProps<T>) {
  const [input, setInput] = useState<Omit<GuessSession<T>, "game">>({ text: "" });
  const { toast, announcement } = input;
  const update = (change: (session: GuessSession<T>) => GuessSession<T>) => {
    const { game: nextGame, ...nextInput } = change({ ...input, game });
    setInput(nextInput);
    if (nextGame !== game) onGameChange(nextGame);
  };
  const session = { ...input, game };
  const { trip } = game;

  const review = useMemo(() => reviewGame(graph, game), [graph, game]);
  const reveals = useMemo(() => hintReveals(graph, game), [graph, game]);
  const finished = review.status !== "playing";
  // A game finished just now keeps the board up for a moment, so the last guess is seen landing.
  const { winLingerMs, lossLingerMs } = useContext(PacingContext);
  const lingerMs = review.status === "won" ? winLingerMs : lossLingerMs;
  const [boardLingered, setBoardLingered] = useState(finished);
  useEffect(() => {
    if (!finished || boardLingered) return;
    const timer = setTimeout(() => setBoardLingered(true), lingerMs);
    return () => clearTimeout(timer);
  }, [finished, boardLingered, lingerMs]);
  const settled = finished && boardLingered;
  // Only that pause plays an effect, so a game reopened from its save, which has none, plays nothing.
  const finishingNow = finished && !boardLingered;
  const wonNow = finishingNow && review.status === "won";
  const { perfect } = review;
  const [openedFinished] = useState(finished);
  const finishedHere = finished && !openedFinished;
  const still = useMemo(
    () => finishedHere && window.matchMedia(REDUCED_MOTION_QUERY).matches,
    [finishedHere],
  );
  // Confetti falls in its own time, past the pause and over the result view.
  const [confettiLanded, setConfettiLanded] = useState(false);
  const confettiLand = useCallback(() => setConfettiLanded(true), []);
  const sweep = useMemo(
    () =>
      wonNow
        ? {
            stops: guessedStops(trip, review.cheapestRoute ?? [], new Set(game.guesses)),
            perfect,
            holdMs: lingerMs,
            still,
          }
        : undefined,
    [wonNow, trip, review.cheapestRoute, game.guesses, perfect, lingerMs, still],
  );
  // Focus follows the result view when it opens or closes by the player's hand, not on reload.
  const [resultToggled, setResultToggled] = useState(false);
  const [resultClosed, setResultClosed] = useState(initiallyClosed);
  const closeResult = (closed: boolean) => {
    setResultToggled(true);
    setResultClosed(closed);
    onResultClosedChange?.(closed);
  };
  const showResult = settled && !resultClosed;
  const reopenButton = useRef<HTMLButtonElement>(null);
  const guessInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (resultClosed && resultToggled) reopenButton.current?.focus();
  }, [resultClosed, resultToggled]);
  const [openedByPlayer] = useState(initiallyOpenedByPlayer);
  // A board loaded behind Starta opens at the reveal, as it is shown. A finished trip's input
  // never takes focus.
  useEffect(() => {
    if (!openedByPlayer || concealed || finished) return;
    window.scrollTo(0, 0);
    guessInput.current?.focus({ preventScroll: true });
  }, [openedByPlayer, concealed, finished]);
  const nameOf = (code: string) => kommunName(graph, code);

  return (
    <section
      className={concealed ? "play-screen play-screen--concealed" : "play-screen"}
      aria-labelledby={concealed ? undefined : "trip-heading"}
      aria-hidden={concealed || undefined}
      inert={concealed}
    >
      {/* Concealed, the board is its map alone, so the reveal keeps the same map, drawn. */}
      {!concealed && label}
      {!concealed && (
        <h2 id="trip-heading">
          <span>Från:</span> <strong className="sign sign--start">{nameOf(trip.start)}</strong>{" "}
          <span>Till:</span>{" "}
          <strong className="sign sign--destination">{nameOf(trip.destination)}</strong>
        </h2>
      )}

      {showResult && (
        <ResultView
          graph={graph}
          game={game}
          review={review}
          headline={resultHeadline}
          actions={resultActions}
          score={resultScore}
          stats={stats}
          sessionStorage={sessionStorage}
          onClose={() => closeResult(true)}
          focusOnOpen={resultToggled || announcement !== undefined}
        />
      )}

      {settled && !showResult && (
        <ResultStrip
          review={review}
          headline={resultHeadline}
          actions={stripActions}
          onOpen={() => closeResult(false)}
          openButtonRef={reopenButton}
        />
      )}

      {/* The board steps aside while the result view is open; closing it brings the board back. */}
      {!showResult && (
        <>
          {/* A rejected guess's toast floats over the map's bottom edge, so nothing moves for it. */}
          <div
            className={
              finishingNow && review.status === "lost" ? "map-frame map-frame--dimmed" : "map-frame"
            }
          >
            <SatelliteMap
              graph={graph}
              trip={trip}
              cards={review.cards}
              hintOutlines={reveals.outlines}
              initials={reveals.initials}
              allOutlines={settled}
              onReady={onMapReady}
              concealed={concealed}
              sweep={sweep}
            />
            {wonNow && <FinishGlow perfect={perfect} />}
            <p role="alert" className="toast">
              {toast}
            </p>
            {!concealed && !settled && mapCorner && <div className="map-corner">{mapCorner}</div>}
          </div>

          {/* A trip over drops its thinking-time bar. */}
          {!concealed && !finished && clock}

          {!concealed && (
            <GuessInput
              text={input.text}
              exactMatch={resolveKommunName(graph, input.text) !== undefined}
              suggestions={suggestKommuner(graph, game, input.text)}
              highlighted={enterTarget(graph, session)}
              counter={
                <GuessCounter
                  label="Gissa"
                  made={review.cards.length}
                  limit={review.limit}
                  over={finished}
                />
              }
              onEvent={(event) => update((current) => applyGuessInput(graph, current, event))}
              inputRef={guessInput}
              disabled={finished}
            />
          )}
        </>
      )}

      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>

      {!showResult && !concealed && (
        <>
          <section className="past-guesses" aria-labelledby="guesses-heading">
            <h3 id="guesses-heading" className="section-heading">
              Tidigare gissningar
            </h3>
            {review.cards.length === 0 && (
              <p className="section-empty">
                Inga gissningar än. Börja med en granne till {nameOf(trip.start)}.
              </p>
            )}
            <ol aria-label="Gissningar">
              {review.cards.map((card, index) => (
                <Fragment key={card.code}>
                  <TimeoutRow timeouts={timeouts?.[index]} />
                  <li>
                    <span aria-hidden="true">
                      {index + 1}. {nameOf(card.code)} {card.feedback}
                    </span>
                    <span className="visually-hidden">
                      {guessCardText(card, { number: index + 1, name: nameOf(card.code) })}
                    </span>
                  </li>
                </Fragment>
              ))}
              <TimeoutRow
                timeouts={timeouts?.[review.cards.length]}
                held={timeouts !== undefined && !finished}
              />
            </ol>
          </section>

          {!finished && (
            <HintSection
              hintsUsed={review.hintsUsed}
              onTakeHint={() => update((current) => takeSessionHint(graph, current))}
              focusAfterLastHint={guessInput}
            />
          )}

          {!finished && game.rules.giveUp && (
            <div className="give-up-row">
              <GiveUp
                onGiveUp={() =>
                  update((current) => ({
                    ...current,
                    game: giveUp(graph, current.game),
                    announcement: "Du gav upp.",
                  }))
                }
              />
            </div>
          )}
        </>
      )}

      {!concealed && (
        <footer className="credits">
          {footerLinks}
          <p>
            Kommungränser och grannar bygger på data från{" "}
            <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a> och
            är licensierade under ODbL.
          </p>
        </footer>
      )}

      {finishedHere && perfect && !still && !confettiLanded && <Confetti onDone={confettiLand} />}
    </section>
  );
}

/**
 * Consecutive timeouts as one row among the guesses, `⏱ ×5`, its tooltip saying what they cost;
 * not a guess, so not numbered.
 * A `held` row with no timeouts yet keeps its place, unseen, so a timeout moves nothing below it.
 */
function TimeoutRow({ timeouts = 0, held = false }: { timeouts?: number; held?: boolean }) {
  if (timeouts === 0) {
    return held ? (
      <li className="timeout-row timeout-row--held" aria-hidden="true">
        ⏱ ×1
      </li>
    ) : null;
  }
  return (
    <li className="timeout-row" title={timeoutRowTitle(timeouts)}>
      <span aria-hidden="true">⏱ ×{timeouts}</span>
      <span className="visually-hidden">{timeoutsText(timeouts)}</span>
    </li>
  );
}
