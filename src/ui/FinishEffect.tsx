import { createContext, useContext, useEffect, useRef } from "react";
import "./FinishEffect.css";

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** The glow around the map as a trip is won; under reduced motion, by the global rule, it stands still. */
export function FinishGlow({ perfect }: { perfect: boolean }) {
  return (
    <div
      className={perfect ? "finish-glow finish-glow--perfect" : "finish-glow"}
      aria-hidden="true"
    />
  );
}

const COLORS = ["#fecc02", "#fecc02", "#ffe680", "#ffffff"];
/** How far below the screen a piece's middle has to be for all of it to have left. */
const PIECE_CLEARANCE = 12;

/** PROTOTYPE (confetti tuner): every number of the confetti, today's values as the defaults. */
export const DEFAULT_CONFETTI_PARAMS = {
  pieces: 500,
  launchSpread: 0,
  drag: 1.2,
  flightMin: 1,
  flightMax: 1.6,
  reachTop: 0.3,
  reachBottom: 0.65,
  reachNear: 0.1,
  reachFar: 0.65,
  fallSpeedMin: 130,
  fallSpeedMax: 220,
  flipSpeedMin: 4,
  flipSpeedMax: 9,
  tiltSpeedMax: 1.5,
  swayMin: 10,
  swayMax: 30,
  swaySpeedMin: 1.5,
  swaySpeedMax: 3,
  widthMin: 6,
  widthMax: 11,
  heightMin: 4,
  heightMax: 7,
  backAlpha: 0.7,
};
export type ConfettiParams = typeof DEFAULT_CONFETTI_PARAMS;
export const ConfettiParamsContext = createContext<ConfettiParams>(DEFAULT_CONFETTI_PARAMS);

const between = (low: number, high: number) => low + Math.random() * (high - low);

/**
 * Gold and white confetti fired across the whole screen from both lower corners, which flutters
 * down until the last piece has left the bottom of the screen, and then says so.
 */
export function Confetti({ onDone }: { onDone: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const params = useContext(ConfettiParamsContext);
  useEffect(() => {
    // Where nothing draws frames, as in a test's DOM, there's nothing to play.
    if (!window.requestAnimationFrame) return;
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;
    const scale = window.devicePixelRatio;
    const width = window.innerWidth;
    const height = window.innerHeight;
    element.width = width * scale;
    element.height = height * scale;
    context.scale(scale, scale);
    const { drag, backAlpha } = params;

    const pieces = Array.from({ length: params.pieces }, (_, index) => {
      const fromLeft = index % 2 === 0;
      const x = fromLeft ? 0 : width;
      // Each piece is launched to pass through a point of its own, so any screen's centre is reached.
      const across = between(params.reachNear, params.reachFar);
      const reachX = width * (fromLeft ? across : 1 - across);
      const reachY = height * between(params.reachTop, params.reachBottom);
      const flight = between(params.flightMin, params.flightMax);
      const slowed = (1 - Math.exp(-drag * flight)) / drag;
      const fallSpeed = between(params.fallSpeedMin, params.fallSpeedMax);
      return {
        x,
        delay: between(0, params.launchSpread),
        launchX: (reachX - x) / slowed,
        launchY: (reachY - height - fallSpeed * flight) / slowed + fallSpeed,
        fallSpeed,
        width: between(params.widthMin, params.widthMax),
        height: between(params.heightMin, params.heightMax),
        tilt: between(0, 2 * Math.PI),
        tiltSpeed: between(-params.tiltSpeedMax, params.tiltSpeedMax),
        flip: between(0, 2 * Math.PI),
        flipSpeed: between(params.flipSpeedMin, params.flipSpeedMax),
        sway: between(params.swayMin, params.swayMax),
        swayPhase: between(0, 2 * Math.PI),
        swaySpeed: between(params.swaySpeedMin, params.swaySpeedMax),
        color: COLORS[Math.floor(Math.random() * COLORS.length)] as string,
      };
    });
    const allLaunchedBy = params.launchSpread + params.flightMax;

    const startedAt = performance.now();
    let frame = requestAnimationFrame(function draw(now) {
      const elapsed = Math.max(0, (now - startedAt) / 1000);
      context.clearRect(0, 0, width, height);
      let highestPiece = Infinity;
      for (const piece of pieces) {
        const seconds = elapsed - piece.delay;
        if (seconds < 0) {
          highestPiece = -Infinity;
          continue;
        }
        const slowed = (1 - Math.exp(-drag * seconds)) / drag;
        const y = height + (piece.launchY - piece.fallSpeed) * slowed + piece.fallSpeed * seconds;
        // The sway grows as the launch dies away, so a piece flies straight and then flutters.
        const sway =
          piece.sway * drag * slowed * Math.sin(piece.swayPhase + piece.swaySpeed * seconds);
        const turned = Math.cos(piece.flip + piece.flipSpeed * seconds);
        highestPiece = Math.min(highestPiece, y);
        context.save();
        context.fillStyle = piece.color;
        context.globalAlpha = turned < 0 ? backAlpha : 1;
        context.translate(piece.x + piece.launchX * slowed + sway, y);
        context.rotate(piece.tilt + piece.tiltSpeed * seconds);
        context.scale(1, turned);
        context.fillRect(-piece.width / 2, -piece.height / 2, piece.width, piece.height);
        context.restore();
      }
      if (elapsed > allLaunchedBy && highestPiece > height + PIECE_CLEARANCE) {
        onDone();
        return;
      }
      frame = requestAnimationFrame(draw);
    });
    return () => cancelAnimationFrame(frame);
  }, [onDone, params]);
  return <canvas ref={canvas} className="finish-confetti" aria-hidden="true" />;
}
