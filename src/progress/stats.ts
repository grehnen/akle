import type { History, HistoryEntry } from "./history";
import { classifyOutcome } from "./outcome";

/** The largest possible extra: a win on the last guess of the longest guess limit. */
export const MAX_EXTRA = 8;

/** One row of the distribution: Perfekt, +0 … +8 or Förlust. */
export type DistributionRow = {
  label: string;
  /** All games in the row, with and without hints. */
  games: number;
  /** The games in the row that used hints; always 0 for Perfekt. */
  withHints: number;
  /** Today's finished game landed in this row. */
  today: boolean;
};

export type Stats = {
  played: number;
  winPercent: number;
  currentStreak: number;
  longestStreak: number;
  distribution: DistributionRow[];
};

/** The stats, derived from the history as seen on trip number `today`. */
export function deriveStats(history: History, today: number): Stats {
  const entries = Object.values(history);
  const wins = entries.filter((entry) => entry.won).length;
  return {
    played: entries.length,
    winPercent: entries.length === 0 ? 0 : Math.round((wins / entries.length) * 100),
    currentStreak: currentStreak(history, today),
    longestStreak: longestStreak(history),
    distribution: distribution(entries, history[today]),
  };
}

const ROW_LABELS = [
  "Perfekt",
  ...Array.from({ length: MAX_EXTRA + 1 }, (_, extra) => `+${extra}`),
  "Förlust",
];

function rowLabel(entry: HistoryEntry): string {
  const outcome = classifyOutcome(entry);
  switch (outcome.kind) {
    case "perfect":
      return "Perfekt";
    case "won":
      return `+${outcome.extra}`;
    case "lost":
      return "Förlust";
  }
}

function distribution(entries: HistoryEntry[], todayEntry: HistoryEntry | undefined) {
  const todayLabel = todayEntry && rowLabel(todayEntry);
  return ROW_LABELS.map((label) => {
    const games = entries.filter((entry) => rowLabel(entry) === label);
    return {
      label,
      games: games.length,
      withHints: games.filter((entry) => entry.hintsUsed > 0).length,
      today: label === todayLabel,
    };
  });
}

const wonTrip = (history: History, tripNumber: number) => history[tripNumber]?.won === true;

/** Today's trip may still be in play, so an unrecorded today doesn't end the streak; yesterday does. */
function currentStreak(history: History, today: number): number {
  let tripNumber = history[today] === undefined ? today - 1 : today;
  let streak = 0;
  while (wonTrip(history, tripNumber)) {
    streak += 1;
    tripNumber -= 1;
  }
  return streak;
}

function longestStreak(history: History): number {
  let longest = 0;
  for (const key of Object.keys(history)) {
    const tripNumber = Number(key);
    if (!wonTrip(history, tripNumber) || wonTrip(history, tripNumber - 1)) continue;
    let length = 0;
    while (wonTrip(history, tripNumber + length)) length += 1;
    longest = Math.max(longest, length);
  }
  return longest;
}
