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
  launchSpread: 1.5,
  drag: 1.2,
  flightMin: 1,
  flightMax: 1.6,
  reachTop: 0.1,
  reachBottom: 0.8,
  reachNear: 0,
  reachFar: 0.65,
  fallSpeedMin: 350,
  fallSpeedMax: 500,
  flipSpeedMin: 7,
  flipSpeedMax: 12,
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
  pixelRatioMax: 3,
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
    const scale = Math.min(window.devicePixelRatio, params.pixelRatioMax);
    let width = 0;
    let height = 0;
    const fitToScreen = () => {
      if (element.clientWidth === width && element.clientHeight === height) return;
      width = element.clientWidth;
      height = element.clientHeight;
      element.width = width * scale;
      element.height = height * scale;
      context.scale(scale, scale);
    };
    fitToScreen();
    const { drag, backAlpha } = params;

    const pieces = Array.from({ length: params.pieces }, (_, index) => {
      const flight = between(params.flightMin, params.flightMax);
      return {
        fromLeft: index % 2 === 0,
        across: between(params.reachNear, params.reachFar),
        reachY: between(params.reachTop, params.reachBottom),
        flight,
        slowedByArrival: (1 - Math.exp(-drag * flight)) / drag,
        delay: between(0, params.launchSpread),
        fallSpeed: between(params.fallSpeedMin, params.fallSpeedMax),
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
      fitToScreen();
      context.clearRect(0, 0, width, height);
      let highestPiece = Infinity;
      for (const piece of pieces) {
        const seconds = elapsed - piece.delay;
        if (seconds < 0) {
          highestPiece = -Infinity;
          continue;
        }
        const slowed = (1 - Math.exp(-drag * seconds)) / drag;
        const progress = slowed / piece.slowedByArrival;
        const shareAcross = piece.across * progress;
        const x = width * (piece.fromLeft ? shareAcross : 1 - shareAcross);
        const y =
          height * (1 + (piece.reachY - 1) * progress) +
          piece.fallSpeed * (seconds - piece.flight * progress);
        // The sway grows as the launch dies away, so a piece flies straight and then flutters.
        const sway =
          piece.sway * drag * slowed * Math.sin(piece.swayPhase + piece.swaySpeed * seconds);
        const turned = Math.cos(piece.flip + piece.flipSpeed * seconds);
        highestPiece = Math.min(highestPiece, y);
        context.save();
        context.fillStyle = piece.color;
        context.globalAlpha = turned < 0 ? backAlpha : 1;
        context.translate(x + sway, y);
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
