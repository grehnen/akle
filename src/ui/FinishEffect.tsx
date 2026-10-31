import { useEffect, useRef } from "react";
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
const PIECES = 1000;
/** Pieces leave their corners at random moments over this long, rather than in one burst. */
const LAUNCH_SPREAD_SECONDS = 1.5;
/** How fast air slows a piece down, per second. */
const DRAG = 1.2;
const FALL_SPEED_MIN = 350;
const FALL_SPEED_MAX = 500;
/** How high up the screen, as shares of its height from the top, the pieces are aimed. */
const REACH_TOP = 0.1;
const REACH_BOTTOM = 0.8;
/** How far across the screen from its own corner a piece is aimed, as shares of the width. */
const REACH_NEAR = 0;
const REACH_FAR = 0.65;
const FLIGHT_SECONDS_MIN = 1;
const FLIGHT_SECONDS_MAX = 1.6;
/** A piece showing its back is drawn this much fainter, so its flip reads as a turn. */
const BACK_ALPHA = 0.7;
/** How far below the screen a piece's middle has to be for all of it to have left. */
const PIECE_CLEARANCE = 12;

const between = (low: number, high: number) => low + Math.random() * (high - low);

/**
 * Gold and white confetti fired across the whole screen from both lower corners, which flutters
 * down until the last piece has left the bottom of the screen, and then says so.
 */
export function Confetti({ onDone }: { onDone: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
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

    const pieces = Array.from({ length: PIECES }, (_, index) => {
      const fromLeft = index % 2 === 0;
      const x = fromLeft ? 0 : width;
      // Each piece is launched to pass through a point of its own, so any screen's centre is reached.
      const across = between(REACH_NEAR, REACH_FAR);
      const reachX = width * (fromLeft ? across : 1 - across);
      const reachY = height * between(REACH_TOP, REACH_BOTTOM);
      const flight = between(FLIGHT_SECONDS_MIN, FLIGHT_SECONDS_MAX);
      const slowed = (1 - Math.exp(-DRAG * flight)) / DRAG;
      const fallSpeed = between(FALL_SPEED_MIN, FALL_SPEED_MAX);
      return {
        x,
        launchAfter: between(0, LAUNCH_SPREAD_SECONDS),
        launchX: (reachX - x) / slowed,
        launchY: (reachY - height - fallSpeed * flight) / slowed + fallSpeed,
        fallSpeed,
        width: between(6, 11),
        height: between(4, 7),
        tilt: between(0, 2 * Math.PI),
        tiltSpeed: between(-1.5, 1.5),
        flip: between(0, 2 * Math.PI),
        flipSpeed: between(7, 12),
        sway: between(10, 30),
        swayPhase: between(0, 2 * Math.PI),
        swaySpeed: between(1.5, 3),
        color: COLORS[Math.floor(Math.random() * COLORS.length)] as string,
      };
    });

    const startedAt = performance.now();
    let frame = requestAnimationFrame(function draw(now) {
      const elapsed = Math.max(0, (now - startedAt) / 1000);
      context.clearRect(0, 0, width, height);
      let highestPiece = Infinity;
      for (const piece of pieces) {
        const seconds = elapsed - piece.launchAfter;
        if (seconds < 0) {
          // Still waiting in its corner, so the confetti isn't over yet.
          highestPiece = -Infinity;
          continue;
        }
        const slowed = (1 - Math.exp(-DRAG * seconds)) / DRAG;
        const y = height + (piece.launchY - piece.fallSpeed) * slowed + piece.fallSpeed * seconds;
        // The sway grows as the launch dies away, so a piece flies straight and then flutters.
        const sway =
          piece.sway * DRAG * slowed * Math.sin(piece.swayPhase + piece.swaySpeed * seconds);
        const turned = Math.cos(piece.flip + piece.flipSpeed * seconds);
        highestPiece = Math.min(highestPiece, y);
        context.save();
        context.fillStyle = piece.color;
        context.globalAlpha = turned < 0 ? BACK_ALPHA : 1;
        context.translate(piece.x + piece.launchX * slowed + sway, y);
        context.rotate(piece.tilt + piece.tiltSpeed * seconds);
        context.scale(1, turned);
        context.fillRect(-piece.width / 2, -piece.height / 2, piece.width, piece.height);
        context.restore();
      }
      const allFlown = elapsed > LAUNCH_SPREAD_SECONDS + FLIGHT_SECONDS_MAX;
      if (allFlown && highestPiece > height + PIECE_CLEARANCE) {
        onDone();
        return;
      }
      frame = requestAnimationFrame(draw);
    });
    return () => cancelAnimationFrame(frame);
  }, [onDone]);
  return <canvas ref={canvas} className="finish-confetti" aria-hidden="true" />;
}
