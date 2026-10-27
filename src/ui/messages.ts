import type { Feedback, GameReview, GameStatus, GuessCard, GuessResult } from "../engine/game";
import type { HINT_COUNT } from "../engine/hints";
import { AWAY_WEIGHT_AT_LIMIT, AWAY_WEIGHT_GIVEN_UP, TIMEOUT_COST } from "../engine/score";
import { MODE_KINDS, type ModeKind, type ModeSetting } from "../freePlay/linkPayload";
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

/**
 * A piece of a result label: plain text, or its timeouts kept as a count, which the share text
 * writes `2 ⏱` and the UI can also read out in words.
 */
export type LabelPart = string | { timeouts: number };

/** What a label's costs are separated by: where a label too long for its line may break. */
export const COST_SEPARATOR = ", ";

/** A label as text, its timeouts written `2 ⏱`. */
export function labelText(parts: readonly LabelPart[]): string {
  return parts.map((part) => (typeof part === "string" ? part : `${part.timeouts} ⏱`)).join("");
}

/** The hints and timeouts a result counts: `1 ledtråd`, `2 ⏱`; none when there are none. */
function costs(hintsUsed: number, timeouts = 0): LabelPart[] {
  return [
    ...(hintsUsed > 0 ? [hintCount(hintsUsed)] : []),
    ...(timeouts > 0 ? [{ timeouts }] : []),
  ];
}

/** `, 2 ledtrådar`, `, 1 ledtråd, 2 ⏱` to close a bracket with, else nothing. */
export function costsSuffixParts(hintsUsed: number, timeouts?: number): LabelPart[] {
  return costs(hintsUsed, timeouts).flatMap((cost) => [COST_SEPARATOR, cost]);
}

export function costsSuffix(hintsUsed: number, timeouts?: number): string {
  return labelText(costsSuffixParts(hintsUsed, timeouts));
}

/** ` (2 ledtrådar)`, ` (1 ledtråd, 2 ⏱)` after a result with hints or timeouts, else nothing. */
export function costsNoteParts(hintsUsed: number, timeouts?: number): LabelPart[] {
  const counted = costs(hintsUsed, timeouts);
  if (counted.length === 0) return [];
  return [
    " (",
    ...counted.flatMap((cost, index) => (index === 0 ? [cost] : [COST_SEPARATOR, cost])),
    ")",
  ];
}

/** A free-play score: `3 poäng`, `−1 poäng` (with a real minus sign). */
export function scoreText(score: number): string {
  return `${score < 0 ? `−${-score}` : score} poäng`;
}

/** Poäng in running text: `en poäng`, `2 poäng`. */
function pointsInWords(points: number): string {
  return points === 1 ? "en poäng" : `${points} poäng`;
}

/** Each mode as the UI names it. */
export const MODE_NAMES: Record<ModeKind, string> = {
  standard: "Standard",
  unlimited: "Obegränsad",
  timed: "Tidspress",
  "tie-breaker": "Tidtagning",
};

/** How each mode plays: the one text that explains a mode, wherever one is chosen or started. */
const MODE_DESCRIPTIONS: Record<ModeKind, string> = {
  standard: "Som dagens resa: gissningarna räcker till avståndet och lite till.",
  unlimited: "Gissa hur många gånger du vill. Ge upp när du vill.",
  timed: `Varje gissning måste göras inom betänketiden. Varje gång tiden går ut kostar ${pointsInWords(TIMEOUT_COST)}.`,
  "tie-breaker": "Tiden tas. Vid lika poäng vinner den snabbaste.",
};

/** How each mode plays in a few words, for a mode card where room is tight. */
const MODE_SHORT_DESCRIPTIONS: Record<ModeKind, string> = {
  standard: "Som dagens resa.",
  unlimited: "Gissa hur många gånger du vill.",
  timed: "Gissa inom betänketiden.",
  "tie-breaker": "Snabbast vinner vid lika poäng.",
};

/** Every mode in the order the player is offered them, with its name and how it plays. */
export const MODES: readonly {
  kind: ModeKind;
  name: string;
  description: string;
  shortDescription: string;
}[] = MODE_KINDS.map((kind) => ({
  kind,
  name: MODE_NAMES[kind],
  description: MODE_DESCRIPTIONS[kind],
  shortDescription: MODE_SHORT_DESCRIPTIONS[kind],
}));

/** How a mode plays. */
export function modeDescription(kind: ModeKind): string {
  return MODE_DESCRIPTIONS[kind];
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

/** What a free-play score means, in the score tooltip and wherever scoring is explained. */
export const SCORE_EXPLANATION = `Lägre poäng är bättre. En perfekt resa ger −1; varje extra gissning, ledtråd och ⏱ kostar ${TIMEOUT_COST}.`;

/** How a lost free-play trip scores, given up or out of guesses. */
export const LOSS_SCORE_EXPLANATION = `Kommer du inte fram räknas varje gissning utöver avståndet, plus ${AWAY_WEIGHT_AT_LIMIT} poäng för varje kommun du är ifrån målet, eller ${AWAY_WEIGHT_GIVEN_UP} om du gav upp. Ledtrådar och ⏱ kostar som vanligt.`;

/** That time never enters a score but only separates equal ones, as the glossary's Score says. */
export const TIME_TIE_BREAK_EXPLANATION =
  "Tiden räknas aldrig in i poängen. Den skiljer bara lika poäng åt: i en resplan vinner först den som vunnit flest resor i Tidtagning, sedan den med lägst total tid.";

/** An itinerary's total time and its won tie-breaker trips: `4:12,3 (2 vunna)`. */
export function totalTimeText(tenths: number, won: number): string {
  return `${timeText(tenths)} (${wonCountText(won)})`;
}

/** An itinerary's won tie-breaker trips, naming their mode: `2 vunna i Tidtagning`. */
export function wonTieBreakersText(won: number): string {
  return `${wonCountText(won)} i Tidtagning`;
}

function wonCountText(won: number): string {
  return `${won} ${won === 1 ? "vunnen" : "vunna"}`;
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
