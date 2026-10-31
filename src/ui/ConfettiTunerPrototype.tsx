// PROTOTYPE (#137): throwaway. Never merge to main.
// Sliders for every number of the Perfect confetti, on the real board, map and result, at
// `/?konfetti=1`. Today's trip is held in memory, so a daily game, history and stats are untouched.
// The values live in the URL, so a reload keeps them.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DailyTripLoad } from "../daily/loadDailyTrip";
import type { DailyTrip } from "../daily/dailyTrip";
import { DAILY_RULES, type Game } from "../engine/game";
import type { GraphVersion } from "../graph/graphVersion";
import { cheapestRoute } from "../graph/routes";
import { memoryStorage } from "../progress/storage";
import {
  Confetti,
  ConfettiParamsContext,
  type ConfettiParams,
  DEFAULT_CONFETTI_PARAMS,
} from "./FinishEffect";
import { TripBoard } from "./TripBoard";
import "./ConfettiTunerPrototype.css";

type Slider = { key: keyof ConfettiParams; label: string; max: number; step: number; min?: number };

const GROUPS: { title: string; sliders: Slider[] }[] = [
  {
    title: "Mängd",
    sliders: [
      { key: "pieces", label: "Antal bitar", max: 1500, step: 10 },
      { key: "launchSpread", label: "Utsläpp över tid (s)", max: 3, step: 0.1 },
    ],
  },
  {
    title: "Uppskjut: fart och höjd",
    sliders: [
      { key: "flightMin", label: "Flygtid till målpunkten, min (s)", min: 0.2, max: 3, step: 0.05 },
      { key: "flightMax", label: "Flygtid till målpunkten, max (s)", min: 0.2, max: 3, step: 0.05 },
      { key: "drag", label: "Luftmotstånd", min: 0.2, max: 4, step: 0.05 },
      { key: "reachTop", label: "Högsta målpunkt (0 = skärmens topp)", max: 1, step: 0.01 },
      { key: "reachBottom", label: "Lägsta målpunkt (1 = skärmens botten)", max: 1, step: 0.01 },
    ],
  },
  {
    title: "Uppskjut: i sidled",
    sliders: [
      { key: "reachNear", label: "Närmast egna hörnet (andel av bredden)", max: 1, step: 0.01 },
      { key: "reachFar", label: "Längst från egna hörnet (andel av bredden)", max: 1, step: 0.01 },
    ],
  },
  {
    title: "Fall",
    sliders: [
      { key: "fallSpeedMin", label: "Fallfart, min (px/s)", min: 20, max: 800, step: 5 },
      { key: "fallSpeedMax", label: "Fallfart, max (px/s)", min: 20, max: 800, step: 5 },
    ],
  },
  {
    title: "Vridning",
    sliders: [
      { key: "flipSpeedMin", label: "Vändfart, min", max: 20, step: 0.5 },
      { key: "flipSpeedMax", label: "Vändfart, max", max: 20, step: 0.5 },
      { key: "tiltSpeedMax", label: "Snurr i planet, max", max: 10, step: 0.1 },
      { key: "backAlpha", label: "Baksidans styrka", max: 1, step: 0.05 },
    ],
  },
  {
    title: "Sidovajning",
    sliders: [
      { key: "swayMin", label: "Vajning, min (px)", max: 150, step: 1 },
      { key: "swayMax", label: "Vajning, max (px)", max: 150, step: 1 },
      { key: "swaySpeedMin", label: "Vajfart, min", max: 10, step: 0.1 },
      { key: "swaySpeedMax", label: "Vajfart, max", max: 10, step: 0.1 },
    ],
  },
  {
    title: "Storlek",
    sliders: [
      { key: "widthMin", label: "Bredd, min (px)", min: 1, max: 30, step: 0.5 },
      { key: "widthMax", label: "Bredd, max (px)", min: 1, max: 30, step: 0.5 },
      { key: "heightMin", label: "Höjd, min (px)", min: 1, max: 30, step: 0.5 },
      { key: "heightMax", label: "Höjd, max (px)", min: 1, max: 30, step: 0.5 },
    ],
  },
];

/** How long after the last slider change the confetti fires on its own. */
const FIRE_AFTER_CHANGE_MS = 350;
/** How long the drawn board shows before its last guess lands. */
const BEFORE_LAST_GUESS_MS = 500;

function paramsFromUrl(): ConfettiParams {
  const query = new URLSearchParams(window.location.search);
  const params = { ...DEFAULT_CONFETTI_PARAMS };
  for (const key of Object.keys(params) as (keyof ConfettiParams)[]) {
    const value = Number(query.get(key) ?? Number.NaN);
    if (!Number.isNaN(value)) params[key] = value;
  }
  return params;
}

/** Only the values changed from today's, which is what's worth reading and reporting. */
function changedFrom(params: ConfettiParams): Partial<ConfettiParams> {
  return Object.fromEntries(
    (Object.keys(params) as (keyof ConfettiParams)[])
      .filter((key) => params[key] !== DEFAULT_CONFETTI_PARAMS[key])
      .map((key) => [key, params[key]]),
  );
}

export function ConfettiTunerPrototype({ daily }: { daily: DailyTripLoad | undefined }) {
  if (daily === undefined) return <p>Laddar …</p>;
  if (daily.kind === "no-trip") return <p>Prototypen behöver dagens resa, men den saknas.</p>;
  return <Tuner graph={daily.graph} trip={daily.trip} />;
}

function Tuner({ graph, trip }: { graph: GraphVersion; trip: DailyTrip }) {
  const [params, setParams] = useState(paramsFromUrl);
  const [fireOnChange, setFireOnChange] = useState(true);
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  const [shot, setShot] = useState(0);
  const [flying, setFlying] = useState(false);
  const [lastRunSeconds, setLastRunSeconds] = useState<number>();
  const shotStartedAt = useRef(0);
  const fire = useCallback(() => {
    shotStartedAt.current = performance.now();
    setShot((count) => count + 1);
    setFlying(true);
    setLastRunSeconds(undefined);
  }, []);
  const landed = useCallback(() => {
    setFlying(false);
    setLastRunSeconds((performance.now() - shotStartedAt.current) / 1000);
  }, []);

  const [play, setPlay] = useState(0);
  const playWin = () => {
    setFlying(false);
    setPlay((count) => count + 1);
  };

  const changed = useMemo(() => changedFrom(params), [params]);
  const report = JSON.stringify(changed, null, 2);

  useEffect(() => {
    const query = new URLSearchParams({ konfetti: "1" });
    for (const [key, value] of Object.entries(changed)) query.set(key, String(value));
    window.history.replaceState(null, "", `?${query}`);
  }, [changed]);

  const pendingFire = useRef<ReturnType<typeof setTimeout>>(undefined);
  const change = (next: (current: ConfettiParams) => ConfettiParams) => {
    setParams(next);
    clearTimeout(pendingFire.current);
    if (fireOnChange) pendingFire.current = setTimeout(fire, FIRE_AFTER_CHANGE_MS);
  };

  return (
    <ConfettiParamsContext value={params}>
      <WinRun key={play} graph={graph} trip={trip} playsWin={play > 0} />
      {flying && <Confetti key={shot} onDone={landed} />}
      <aside className="tuner" aria-label="Konfetti-prototyp">
        <div className="tuner__actions">
          <button type="button" onClick={fire}>
            🎉 Bara konfetti
          </button>
          <button type="button" onClick={playWin}>
            ▶ Hel Perfekt-vinst
          </button>
          <button type="button" onClick={() => setOpen((current) => !current)}>
            {open ? "Dölj" : "Visa"}
          </button>
        </div>
        {open && (
          <>
            <label className="tuner__check">
              <input
                type="checkbox"
                checked={fireOnChange}
                onChange={(event) => setFireOnChange(event.target.checked)}
              />{" "}
              Skjut när ett värde ändras
            </label>
            <p className="tuner__status">
              {flying
                ? "Konfettin faller …"
                : lastRunSeconds === undefined
                  ? "Redo."
                  : `Senaste skottet tog ${lastRunSeconds.toFixed(1)} s.`}
            </p>
            {GROUPS.map(({ title, sliders }) => (
              <fieldset key={title}>
                <legend>{title}</legend>
                {sliders.map(({ key, label, min = 0, max, step }) => (
                  <label key={key} className="tuner__slider">
                    <span>
                      {label}{" "}
                      <strong
                        className={params[key] !== DEFAULT_CONFETTI_PARAMS[key] ? "changed" : ""}
                      >
                        {params[key]}
                      </strong>
                    </span>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      step={step}
                      value={params[key]}
                      onChange={(event) =>
                        change((current) => ({ ...current, [key]: Number(event.target.value) }))
                      }
                    />
                  </label>
                ))}
              </fieldset>
            ))}
            <div className="tuner__report">
              <strong>Ändrade värden</strong>
              <textarea readOnly rows={Math.min(10, report.split("\n").length)} value={report} />
              <div className="tuner__actions">
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(report);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? "Kopierat!" : "Kopiera"}
                </button>
                <button type="button" onClick={() => change(() => DEFAULT_CONFETTI_PARAMS)}>
                  Återställ
                </button>
              </div>
            </div>
          </>
        )}
      </aside>
    </ConfettiParamsContext>
  );
}

/** Today's trip on the real board, one guess from a Perfect win; `playsWin` makes that guess. */
function WinRun({
  graph,
  trip,
  playsWin,
}: {
  graph: GraphVersion;
  trip: DailyTrip;
  playsWin: boolean;
}) {
  const stops = useMemo(
    () => (cheapestRoute(graph, trip.start, trip.destination, new Set()) ?? []).slice(1, -1),
    [graph, trip],
  );
  const [game, setGame] = useState<Game<DailyTrip>>(() => ({
    trip,
    rules: DAILY_RULES,
    guesses: stops.slice(0, -1),
  }));
  const [mapDrawn, setMapDrawn] = useState(false);
  const [sessionStorage] = useState(memoryStorage);
  useEffect(() => {
    if (!playsWin || !mapDrawn) return;
    const timer = setTimeout(
      () => setGame((current) => ({ ...current, guesses: stops })),
      BEFORE_LAST_GUESS_MS,
    );
    return () => clearTimeout(timer);
  }, [playsWin, mapDrawn, stops]);
  return (
    <TripBoard
      graph={graph}
      game={game}
      onGameChange={setGame}
      sessionStorage={sessionStorage}
      label={<p className="trip-number">Konfetti-prototyp</p>}
      onMapReady={() => setMapDrawn(true)}
    />
  );
}
