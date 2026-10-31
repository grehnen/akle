// PROTOTYPE (#137): throwaway. Never merge to main.
// Three effects for a finished trip, plus today's none, on the real TripBoard, map and hold, on `/`:
//   /?variant=alla|a|b|c|nu&utfall=perfekt|vinst|forlust|geupp&avstand=2|5|10&hold=1500
// A trip from the real graph is held in memory one move from its end, then that move is made once
// the map is drawn. Nothing is saved, so a daily game, history and stats are untouched.
import { useEffect, useMemo, useState } from "react";
import type { DailyTripLoad } from "../daily/loadDailyTrip";
import { DAILY_RULES, type Game, giveUp, reviewGame, type Trip } from "../engine/game";
import { guessLimit } from "../engine/guessLimit";
import { type GraphVersion, type KommunCode, kommunName } from "../graph/graphVersion";
import { cheapestRoute, shortestRouteLengthsFrom } from "../graph/routes";
import { memoryStorage } from "../progress/storage";
import { DEFAULT_PACING, PacingContext } from "./pacing";
import { TripBoard } from "./TripBoard";
import { type EffectVariant, EffectVariantContext } from "./TripEffectPrototype";

const VARIANTS: readonly { key: EffectVariant; name: string }[] = [
  { key: "alla", name: "Allt ihop" },
  { key: "a", name: "Rutten lyser upp" },
  { key: "b", name: "Konfetti" },
  { key: "c", name: "Sken runt kartan" },
  { key: "nu", name: "Som i dag: ingen effekt" },
];
const OUTCOMES = [
  { key: "perfekt", name: "Perfekt" },
  { key: "vinst", name: "Vinst" },
  { key: "forlust", name: "Förlust" },
  { key: "geupp", name: "Ge upp" },
] as const;
type OutcomeKey = (typeof OUTCOMES)[number]["key"];
const DISTANCES = [2, 5, 10];
const HOLDS = [1500, 2000, 2500, 3000];

/** How long the board shows, drawn, before the last move, so the move is seen landing. */
const BEFORE_LAST_MOVE_MS = 700;

type Scenario = {
  trip: Trip;
  before: Game<Trip>;
  last: (game: Game<Trip>) => Game<Trip>;
};

function tripAtDistance(graph: GraphVersion, distance: number): Trip {
  const codes = [...graph.kommuner.keys()].sort();
  for (let offset = 0; offset < codes.length; offset++) {
    const start = codes[(offset * 37) % codes.length] as KommunCode;
    if (graph.deadEnds.has(start)) continue;
    for (const [destination, steps] of shortestRouteLengthsFrom(graph, start)) {
      if (steps === distance && !graph.deadEnds.has(destination)) return { start, destination };
    }
  }
  throw new Error(`No trip at distance ${distance}`);
}

function scenarioFor(graph: GraphVersion, outcome: OutcomeKey, distance: number): Scenario {
  const trip = tripAtDistance(graph, distance);
  const route = cheapestRoute(graph, trip.start, trip.destination, new Set()) ?? [];
  const stops = route.slice(1, -1);
  const fromStart = shortestRouteLengthsFrom(graph, trip.start);
  const fromDestination = shortestRouteLengthsFrom(graph, trip.destination);
  // Near the route but touching none of it, as a real wrong guess tends to be: far-flung ones would
  // zoom the map out to all of Sweden and make every loss effect look tiny.
  const beside = new Set(route.flatMap((code) => [...(graph.neighbors.get(code) ?? [])]));
  const closeness = (code: KommunCode) =>
    (fromStart.get(code) ?? 0) + (fromDestination.get(code) ?? 0);
  const wrong = [...graph.kommuner.keys()]
    .filter((code) => !route.includes(code) && !beside.has(code) && !graph.deadEnds.has(code))
    .sort((a, b) => closeness(a) - closeness(b));
  const firstHalf = stops.slice(0, Math.floor(stops.length / 2));
  const game = (guesses: readonly KommunCode[], allowGiveUp = false): Game<Trip> => ({
    trip,
    rules: { ...DAILY_RULES, giveUp: allowGiveUp },
    guesses,
  });
  const guessing = (code: KommunCode) => (current: Game<Trip>) => ({
    ...current,
    guesses: [...current.guesses, code],
  });
  const lastStop = stops.at(-1) as KommunCode;

  if (outcome === "perfekt") {
    return { trip, before: game(stops.slice(0, -1)), last: guessing(lastStop) };
  }
  if (outcome === "vinst") {
    return {
      trip,
      before: game([wrong[0] as KommunCode, ...stops.slice(0, -1)]),
      last: guessing(lastStop),
    };
  }
  if (outcome === "geupp") {
    return { trip, before: game(firstHalf, true), last: (current) => giveUp(graph, current) };
  }
  const wrongNeeded = guessLimit(stops.length) - firstHalf.length - 1;
  return {
    trip,
    before: game([...firstHalf, ...wrong.slice(0, wrongNeeded)]),
    last: guessing(wrong[wrongNeeded] as KommunCode),
  };
}

function readParam<T extends string | number>(name: string, allowed: readonly T[], fallback: T): T {
  const value = new URLSearchParams(window.location.search).get(name);
  return allowed.find((option) => String(option) === value) ?? fallback;
}

export function TripEffectsPrototype({ daily }: { daily: DailyTripLoad | undefined }) {
  if (daily === undefined) return <p>Laddar grafen…</p>;
  if (daily.kind === "no-trip") return <p>Prototypen behöver en graf, men dagens resa saknas.</p>;
  return <Harness graph={daily.graph} />;
}

function Harness({ graph }: { graph: GraphVersion }) {
  const [variant, setVariant] = useState<EffectVariant>(() =>
    readParam(
      "variant",
      VARIANTS.map((option) => option.key),
      "alla",
    ),
  );
  const [outcome, setOutcome] = useState<OutcomeKey>(() =>
    readParam(
      "utfall",
      OUTCOMES.map((option) => option.key),
      "perfekt",
    ),
  );
  const [distance, setDistance] = useState(() => readParam("avstand", DISTANCES, 5));
  const [hold, setHold] = useState(() => readParam("hold", HOLDS, 1500));
  const [run, setRun] = useState(0);
  const replay = () => setRun((count) => count + 1);

  useEffect(() => {
    const params = new URLSearchParams({
      variant,
      utfall: outcome,
      avstand: String(distance),
      hold: String(hold),
    });
    window.history.replaceState(null, "", `?${params}`);
  }, [variant, outcome, distance, hold]);

  const scenario = useMemo(() => scenarioFor(graph, outcome, distance), [graph, outcome, distance]);
  const stepVariant = (by: number) => {
    const index = VARIANTS.findIndex((option) => option.key === variant);
    setVariant(VARIANTS[(index + by + VARIANTS.length) % VARIANTS.length]?.key ?? "alla");
    replay();
  };

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable], .satellite-map")) return;
      if (event.key === "ArrowLeft") stepVariant(-1);
      if (event.key === "ArrowRight") stepVariant(1);
      if (event.key === "r") replay();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <PacingContext value={{ ...DEFAULT_PACING, finishLingerMs: hold }}>
      <EffectVariantContext value={variant}>
        <Run
          key={`${run}-${variant}-${outcome}-${distance}-${hold}`}
          graph={graph}
          scenario={scenario}
          bar={
            <div className="effects-bar" role="group" aria-label="Prototyp">
              <button type="button" onClick={() => stepVariant(-1)}>
                ←
              </button>
              <strong>
                {variant.toUpperCase()} ({VARIANTS.find((option) => option.key === variant)?.name})
              </strong>
              <button type="button" onClick={() => stepVariant(1)}>
                →
              </button>
              <button type="button" onClick={replay}>
                ▶ Spela igen (r)
              </button>
              <label>
                Utfall{" "}
                <select
                  value={outcome}
                  onChange={(event) => setOutcome(event.target.value as OutcomeKey)}
                >
                  {OUTCOMES.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Avstånd{" "}
                <select
                  value={distance}
                  onChange={(event) => setDistance(Number(event.target.value))}
                >
                  {DISTANCES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Paus{" "}
                <select value={hold} onChange={(event) => setHold(Number(event.target.value))}>
                  {HOLDS.map((option) => (
                    <option key={option} value={option}>
                      {option} ms
                    </option>
                  ))}
                </select>
              </label>
            </div>
          }
        />
      </EffectVariantContext>
    </PacingContext>
  );
}

/** One play of the scenario: mounted fresh, so TripBoard sees a live finish and not a restored one. */
function Run({
  graph,
  scenario,
  bar,
}: {
  graph: GraphVersion;
  scenario: Scenario;
  bar: React.ReactNode;
}) {
  const [game, setGame] = useState(scenario.before);
  const [mapDrawn, setMapDrawn] = useState(false);
  const [sessionStorage] = useState(memoryStorage);
  useEffect(() => {
    if (!mapDrawn) return;
    const timer = setTimeout(() => setGame(scenario.last), BEFORE_LAST_MOVE_MS);
    return () => clearTimeout(timer);
  }, [mapDrawn, scenario]);
  const review = reviewGame(graph, game);
  return (
    <>
      <TripBoard
        graph={graph}
        game={game}
        onGameChange={setGame}
        sessionStorage={sessionStorage}
        label={<p className="trip-number">Prototyp #137</p>}
        resultHeadline={review.status === "won" ? "Framme!" : "Slut på resan"}
        onMapReady={() => setMapDrawn(true)}
      />
      <div className="effects-dock">
        {bar}
        <code className="effects-state">
          {kommunName(graph, scenario.trip.start)} → {kommunName(graph, scenario.trip.destination)}{" "}
          · status={review.status} · perfect={String(review.perfect)} · givenUp=
          {String(review.givenUp)} · n={review.n} · away={review.away} · guesses=
          {review.cards.length}/{review.limit}
        </code>
      </div>
    </>
  );
}
