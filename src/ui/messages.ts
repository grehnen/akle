import type { Feedback, GameReview, GameStatus, GuessCard, GuessResult } from "../engine/game";
import type { HINT_COUNT } from "../engine/hints";
import { TIMEOUT_COST } from "../engine/score";
import type { ModeSetting } from "../freePlay/linkPayload";
import { gameOutcome, type Outcome } from "../progress/outcome";

type RejectionReason = Extract<GuessResult, { kind: "rejected" }>["reason"];

export function rejectionMessage(reason: RejectionReason, input: string): string {
  switch (reason) {
    case "unknown":
      return `Okänd kommun: ${input}`;
    case "repeat":
      return `Redan gissad: ${input}`;
    case "endpoint":
      return `Det är start-/målkommunen: ${input}`;
    case "game-over":
      return "Spelet är slut";
  }
}

/**
 * The result view's outcome: `Framme! (+2)`, `Framme! (+1, 1 ledtråd)`, `Perfekt!`,
 * `Slut på gissningar (3 ifrån)` or, for a give-up, `Gav upp (3 ifrån)`.
 */
export function resultOutcome(
  review: Pick<GameReview, "status" | "extra" | "perfect" | "away"> &
    Partial<Pick<GameReview, "hintsUsed" | "givenUp" | "timeouts">>,
): string | undefined {
  const outcome = gameOutcome(review);
  switch (outcome?.kind) {
    case undefined:
      return undefined;
    case "perfect":
      return "Perfekt!";
    case "won":
      return `Framme! (+${outcome.extra}${costsSuffix(outcome.hintsUsed, outcome.timeouts)})`;
    case "lost":
      return `${outcome.givenUp ? "Gav upp" : "Slut på gissningar"} (${outcome.away} ifrån${costsSuffix(outcome.hintsUsed, outcome.timeouts)})`;
  }
}

/** The hints and timeouts a result counts: `1 ledtråd`, `2 ⏱`; none when there are none. */
function costs(hintsUsed: number, timeouts = 0): string[] {
  return [
    ...(hintsUsed > 0 ? [hintCount(hintsUsed)] : []),
    ...(timeouts > 0 ? [`${timeouts} ⏱`] : []),
  ];
}

/** `, 2 ledtrådar`, `, 1 ledtråd, 2 ⏱` to close a bracket with, else nothing. */
export function costsSuffix(hintsUsed: number, timeouts?: number): string {
  return costs(hintsUsed, timeouts)
    .map((cost) => `, ${cost}`)
    .join("");
}

/** ` (2 ledtrådar)`, ` (1 ledtråd, 2 ⏱)` after a result with hints or timeouts, else nothing. */
export function costsNote(hintsUsed: number, timeouts?: number): string {
  const counted = costs(hintsUsed, timeouts);
  return counted.length > 0 ? ` (${counted.join(", ")})` : "";
}

/** A free-play score: `3 poäng`, `−1 poäng` (with a real minus sign). */
export function scoreText(score: number): string {
  return `${score < 0 ? `−${-score}` : score} poäng`;
}

/** Each mode as the UI names it. */
export const MODE_NAMES: Record<ModeSetting["kind"], string> = {
  standard: "Standard",
  unlimited: "Obegränsad",
  timed: "Tidspress",
  "tie-breaker": "Tidtagning",
};

/**
 * Every mode in the order the player is offered them, with its name and how it plays: the one
 * text that explains a mode, wherever one is chosen or started.
 */
export const MODES: readonly { kind: ModeSetting["kind"]; name: string; description: string }[] = [
  {
    kind: "standard",
    name: MODE_NAMES.standard,
    description: "Som dagens resa: gissningarna räcker till avståndet och lite till.",
  },
  {
    kind: "unlimited",
    name: MODE_NAMES.unlimited,
    description: "Gissa hur många gånger du vill. Ge upp när du vill.",
  },
  {
    kind: "timed",
    name: MODE_NAMES.timed,
    description:
      "Varje gissning måste göras inom betänketiden. Varje gång tiden går ut kostar en poäng, även före första gissningen.",
  },
  {
    kind: "tie-breaker",
    name: MODE_NAMES["tie-breaker"],
    description: "Tiden tas. Vid lika poäng vinner den snabbaste.",
  },
];

/** How a mode plays, as {@link MODES} words it. */
export function modeDescription(kind: ModeSetting["kind"]): string {
  return MODES.find((mode) => mode.kind === kind)?.description ?? "";
}

/** A mode as the UI names it, with a timed trip's thinking time: `Standard`, `Tidspress 10 s`. */
export function modeName(mode: ModeSetting): string {
  const name = MODE_NAMES[mode.kind];
  return mode.kind === "timed" ? `${name} ${mode.thinkingTime} s` : name;
}

/** The guesses made so far, with the board's own words for none: `inga gissningar än`, `1 gissning`, `3 gissningar`. */
export function guessesSoFar(guesses: number): string {
  if (guesses === 0) return "inga gissningar än";
  return `${guesses} ${guesses === 1 ? "gissning" : "gissningar"}`;
}

/** A running time, in whole seconds: `1:23`, or `1:02:05` past an hour. */
export function clockText(milliseconds: number): string {
  return hoursMinutesSeconds(Math.floor(milliseconds / 1000));
}

/** A win's time, kept to tenths: `1:23,4`, or `1:00:00,0` past an hour. */
export function timeText(tenths: number): string {
  return `${hoursMinutesSeconds(Math.floor(tenths / 10))},${tenths % 10}`;
}

/**
 * A free-play result's heading, which leaves the costs to its score line: `Perfekt!`, `Framme!`,
 * `Slut på gissningar` or `Gav upp`.
 */
export function freePlayHeadline(outcome: Outcome): string {
  switch (outcome.kind) {
    case "perfect":
      return "Perfekt!";
    case "won":
      return "Framme!";
    case "lost":
      return outcome.givenUp ? "Gav upp" : "Slut på gissningar";
  }
}

/** Said beside a free-play score, which never says on its own which way is better. */
export const LOWER_IS_BETTER = "Lägre är bättre";

/** An itinerary's total time and its won tie-breaker trips: `4:12,3 (2 vunna)`. */
export function totalTimeText(tenths: number, won: number): string {
  return `${timeText(tenths)} (${won} ${won === 1 ? "vunnen" : "vunna"})`;
}

function hoursMinutesSeconds(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
}

/** How many times, counted: `1 gång`, `5 gånger`. */
export function timesText(times: number): string {
  return times === 1 ? "1 gång" : `${times} gånger`;
}

/** A ⏱ row's tooltip, what its timeouts were and cost: `Tiden ute 1 gång, 1 poäng`. */
export function timeoutRowTitle(timeouts: number): string {
  return `Tiden ute ${timesText(timeouts)}, ${scoreText(timeouts * TIMEOUT_COST)}`;
}

/** Timeouts in words, as announced and as a ⏱ row reads: `Tiden ute`, `Tiden ute 5 gånger`. */
export function timeoutsText(timeouts: number): string {
  return timeouts === 1 ? "Tiden ute" : `Tiden ute ${timeouts} gånger`;
}

/** What is announced as a thinking time's last third begins: `3 sekunder kvar`, `1 sekund kvar`. */
export function warningAnnouncement(seconds: number): string {
  return seconds === 1 ? "1 sekund kvar" : `${seconds} sekunder kvar`;
}

/** `1 ledtråd`, `2 ledtrådar`. */
/** Hints taken, counted: `0 ledtrådar`, `1 ledtråd`. */
export function hintCount(hints: number): string {
  return hints === 1 ? "1 ledtråd" : `${hints} ledtrådar`;
}

/** The hint buttons, in the order they're taken: what each hint reveals. */
export const HINT_LABELS = [
  "Visa nästa kommun",
  "Visa alla kommuner",
  "Visa initialer",
] as const satisfies readonly string[] & {
  length: typeof HINT_COUNT;
};

const FEEDBACK_TEXTS: Record<Feedback, string> = {
  "✅": "på kortaste vägen och ansluten",
  "🟩": "på en kortaste väg",
  "🟧": "nära en kortaste väg",
  "🟥": "långt från en kortaste väg",
};

/** A feedback square in words, for screen readers. */
export function feedbackText(feedback: Feedback): string {
  return FEEDBACK_TEXTS[feedback];
}

/**
 * What the live region says after a guess: `Gissning 2 av 7: Trosa, på en kortaste väg.`, then
 * the end of the game if it ended. ✅ already says the guess is connected.
 */
export function guessAnnouncement(
  card: GuessCard,
  {
    number,
    limit,
    name,
    status,
  }: { number: number; limit: number | undefined; name: string; status: GameStatus },
): string {
  const connected = card.connected ? connectionText(card) : "";
  const ending =
    status === "won" ? " Du nådde målet!" : status === "lost" ? " Slut på gissningar." : "";
  const counted = limit === undefined ? `${number}` : `${number} av ${limit}`;
  return `Gissning ${counted}: ${name}, ${feedbackText(card.feedback)}${connected}.${ending}`;
}

/** What the live region says after hint `taken` (1 to 3). */
export function hintAnnouncement(taken: number): string {
  switch (taken) {
    case 1:
      return "Ledtråd 1: nästa kommun på en kortaste väg visas som kontur på kartan.";
    case 2:
      return "Ledtråd 2: alla kommuner visas som konturer på kartan.";
    default:
      return `Ledtråd ${taken}: kommunernas initialer visas när du pekar på konturerna.`;
  }
}

/** A guess card in words: `Gissning 2: Trosa, på en kortaste väg, inte ansluten till start.` */
export function guessCardText(
  card: GuessCard,
  { number, name }: { number: number; name: string },
): string {
  return `Gissning ${number}: ${name}, ${feedbackText(card.feedback)}${connectionText(card)}.`;
}

/** Whether a guess off the route is connected to the start; a ✅ guess always is, so it says nothing. */
function connectionText(card: GuessCard): string {
  if (card.feedback === "✅") return "";
  return card.connected ? ", ansluten till start" : ", inte ansluten till start";
}
