import { useEffect, useRef } from "react";
import "./FinishEffect.css";

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** What's laid over the map as a trip is won: a glow around it, and on Perfect, confetti. */
export function WinEffect({
  perfect,
  holdMs,
  still,
}: {
  perfect: boolean;
  holdMs: number;
  /** Reduced motion: the glow stands still, by the global rule, and there's no confetti. */
  still: boolean;
}) {
  return (
    <>
      <div
        className={perfect ? "finish-glow finish-glow--perfect" : "finish-glow"}
        aria-hidden="true"
      />
      {perfect && !still && <Confetti holdMs={holdMs} />}
    </>
  );
}

const COLORS = ["#fecc02", "#fecc02", "#ffe680", "#ffffff"];
const PIECES = 500;
const GRAVITY = 900;
const DRAG = 1.2;
const SPIN = 8;
/** How high up the screen, as shares of its height from the top, the pieces are aimed. */
const REACH_TOP = 0.2;
const REACH_BOTTOM = 0.6;
const FLIGHT_SECONDS_MIN = 0.6;
const FLIGHT_SECONDS_MAX = 1.1;
/** The share of the hold after which the confetti starts fading, gone as the result opens. */
const FADE_FROM = 2 / 3;

/** Gold and white confetti fired across the whole screen from both lower corners. */
function Confetti({ holdMs }: { holdMs: number }) {
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

    const between = (low: number, high: number) => low + Math.random() * (high - low);
    const pieces = Array.from({ length: PIECES }, (_, index) => {
      const fromLeft = index % 2 === 0;
      const x = fromLeft ? 0 : width;
      // Each piece is launched to pass through a point of its own, so any screen's centre is reached.
      const reachX = width * between(fromLeft ? 0.1 : 0.35, fromLeft ? 0.65 : 0.9);
      const reachY = height * between(REACH_TOP, REACH_BOTTOM);
      const seconds = between(FLIGHT_SECONDS_MIN, FLIGHT_SECONDS_MAX);
      return {
        x,
        y: height,
        vx: ((reachX - x) * DRAG) / (1 - Math.exp(-DRAG * seconds)),
        vy: (reachY - height) / seconds - (GRAVITY * seconds) / 2,
        size: 5 + Math.random() * 6,
        spin: Math.random() * 6,
        color: COLORS[Math.floor(Math.random() * COLORS.length)] as string,
      };
    });

    const startedAt = performance.now();
    let last = startedAt;
    let frame = requestAnimationFrame(function draw(now) {
      const seconds = (now - last) / 1000;
      last = now;
      const life = (now - startedAt) / holdMs;
      context.clearRect(0, 0, width, height);
      context.globalAlpha = Math.max(0, Math.min(1, (1 - life) / (1 - FADE_FROM)));
      for (const piece of pieces) {
        piece.vy += GRAVITY * seconds;
        piece.vx *= 1 - DRAG * seconds;
        piece.x += piece.vx * seconds;
        piece.y += piece.vy * seconds;
        piece.spin += SPIN * seconds;
        context.save();
        context.fillStyle = piece.color;
        context.translate(piece.x, piece.y);
        context.rotate(piece.spin);
        context.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2);
        context.restore();
      }
      frame = requestAnimationFrame(draw);
    });
    return () => cancelAnimationFrame(frame);
  }, [holdMs]);
  return <canvas ref={canvas} className="finish-confetti" aria-hidden="true" />;
}
