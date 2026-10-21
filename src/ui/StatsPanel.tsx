import { type CSSProperties, useId } from "react";
import type { Stats } from "../progress/stats";
import "./StatsPanel.css";

/**
 * Spelade, Vinst %, the two streaks, and the distribution with today's row highlighted. Each
 * row's games with hints end its bar as an unfilled outline, like hint outlines on the map.
 */
export function StatsPanel({ stats }: { stats: Stats }) {
  const headingId = useId();
  const most = Math.max(1, ...stats.distribution.map((row) => row.games));
  const anyHints = stats.distribution.some((row) => row.withHints > 0);
  const figures: [string, number][] = [
    ["Spelade", stats.played],
    ["Vinst %", stats.winPercent],
    ["Nuvarande svit", stats.currentStreak],
    ["Längsta svit", stats.longestStreak],
  ];

  return (
    <section className="stats" aria-labelledby={headingId}>
      <h3 id={headingId}>Statistik</h3>
      <dl className="stats-figures">
        {figures.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <ol className="stats-distribution" aria-label="Fördelning">
        {stats.distribution.map((row) => (
          <li
            key={row.label}
            aria-current={row.today ? "true" : undefined}
            className={rowClass(row.label)}
          >
            <span className="row-label">{row.label}</span>
            <span className="row-track">
              <span
                className={row.games === 0 ? "row-bar row-empty" : "row-bar"}
                data-hints={hintShare(row.games, row.withHints)}
                style={
                  {
                    "--share": row.games / most,
                    "--hinted": row.games === 0 ? 0 : row.withHints / row.games,
                  } as CSSProperties
                }
              >
                {row.games}
              </span>
            </span>
            {row.withHints > 0 && (
              <span className="visually-hidden">, varav {row.withHints} med ledtrådar</span>
            )}
          </li>
        ))}
      </ol>
      {anyHints && (
        <p className="stats-key" aria-hidden="true">
          <span className="stats-key-swatch" />
          Med ledtrådar
        </p>
      )}
    </section>
  );
}

function hintShare(games: number, withHints: number): "some" | "all" | undefined {
  if (withHints === 0) return undefined;
  return withHints === games ? "all" : "some";
}

function rowClass(label: string): string {
  if (label === "Perfekt") return "row-perfect";
  return label === "Förlust" ? "row-loss" : "row-win";
}
