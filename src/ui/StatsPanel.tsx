import { type CSSProperties, useId } from "react";
import type { Stats } from "../progress/stats";
import "./StatsPanel.css";

/** Spelade, Vinst %, the two streaks, and the distribution with today's row highlighted. */
export function StatsPanel({ stats }: { stats: Stats }) {
  const headingId = useId();
  const most = Math.max(1, ...stats.distribution.map((row) => row.games));
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
                style={{ "--share": row.games / most } as CSSProperties}
              >
                {row.games}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function rowClass(label: string): string {
  if (label === "Perfekt") return "row-perfect";
  return label === "Förlust" ? "row-loss" : "row-win";
}
