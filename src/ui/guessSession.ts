import { type Game, reviewGame, submitGuess, type Trip } from "../engine/game";
import { takeHint } from "../engine/hints";
import { foldKommunName, normalizeKommunName, resolveKommunName } from "../engine/kommunNames";
import { type GraphVersion, type KommunCode, kommunName } from "../graph/graphVersion";
import { guessAnnouncement, hintAnnouncement, rejectionMessage } from "./messages";

/** Why a suggestion can't be picked, shown as its tag. */
export type SuggestionTag = "redan gissad" | "start" | "mål";

export type Suggestion = {
  code: KommunCode;
  name: string;
  disabled?: SuggestionTag;
};

const MAX_SUGGESTIONS = 8;

/**
 * The play screen's input state: the game, the typed text, the arrow highlight, the toast and
 * what the live region last announced.
 */
export type GuessSession<T extends Trip = Trip> = {
  game: Game<T>;
  text: string;
  highlighted?: KommunCode;
  toast?: string;
  /** Set by accepted guesses and hints only, so nothing is announced after a reload. */
  announcement?: string;
};

export type GuessInputEvent =
  | { type: "type"; text: string }
  | { type: "arrow"; direction: "up" | "down" }
  /** A click on a suggestion. */
  | { type: "pick"; code: KommunCode }
  | { type: "enter" }
  /** The Gissa button. */
  | { type: "gissa" };

/**
 * Which way an arrow key moves the highlight through the suggestions. A list that opens upward is
 * drawn bottom to top, so the keys swap to keep the highlight moving the way the arrow points.
 */
export function arrowDirection(
  key: "ArrowDown" | "ArrowUp",
  { listOpensUpward }: { listOpensUpward: boolean },
): "down" | "up" {
  const down = key === "ArrowDown";
  return down !== listOpensUpward ? "down" : "up";
}

/**
 * The two-step guess input: picking a suggestion only fills the field, and only an exact
 * match is submitted. Rejected guesses show a toast and are not counted.
 */
export function applyGuessInput<T extends Trip>(
  graph: GraphVersion,
  session: GuessSession<T>,
  event: GuessInputEvent,
): GuessSession<T> {
  switch (event.type) {
    case "type":
      return { ...session, text: event.text, highlighted: undefined };
    case "arrow":
      return moveHighlight(graph, session, event.direction);
    case "pick": {
      const suggestion = pickable(graph, session).find((s) => s.code === event.code);
      return suggestion ? fill(session, suggestion) : session;
    }
    case "enter":
      return pressEnter(graph, session);
    case "gissa":
      return submit(graph, session);
  }
}

function pressEnter<T extends Trip>(
  graph: GraphVersion,
  session: GuessSession<T>,
): GuessSession<T> {
  const options = pickable(graph, session);
  const highlighted = options.find((s) => s.code === session.highlighted);
  if (highlighted) return fill(session, highlighted);
  if (resolveKommunName(graph, session.text) !== undefined) return submit(graph, session);

  const top = options[0];
  return top ? fill(session, top) : submit(graph, session);
}

/**
 * The suggestion Enter acts on, so the list can highlight it before any arrow key is pressed:
 * the arrow highlight, else an exact match, else the best suggestion not already guessed.
 * Undefined when Enter would submit something the list doesn't offer, such as a guessed kommun.
 */
export function enterTarget(graph: GraphVersion, session: GuessSession): KommunCode | undefined {
  const options = pickable(graph, session);
  if (options.some((s) => s.code === session.highlighted)) return session.highlighted;
  const exact = resolveKommunName(graph, session.text);
  if (exact !== undefined) return options.some((s) => s.code === exact) ? exact : undefined;
  return options[0]?.code;
}

function moveHighlight<T extends Trip>(
  graph: GraphVersion,
  session: GuessSession<T>,
  direction: "up" | "down",
): GuessSession<T> {
  const options = pickable(graph, session);
  if (options.length === 0) return session;
  const current = options.findIndex((s) => s.code === enterTarget(graph, session));
  const step = direction === "down" ? 1 : -1;
  const next =
    current === -1
      ? direction === "down"
        ? 0
        : options.length - 1
      : (current + step + options.length) % options.length;
  return { ...session, highlighted: options[next]?.code };
}

function fill<T extends Trip>(session: GuessSession<T>, suggestion: Suggestion): GuessSession<T> {
  return { ...session, text: suggestion.name, highlighted: undefined };
}

function pickable(graph: GraphVersion, session: GuessSession): Suggestion[] {
  return suggestKommuner(graph, session.game, session.text).filter((s) => !s.disabled);
}

function submit<T extends Trip>(graph: GraphVersion, session: GuessSession<T>): GuessSession<T> {
  if (session.text.trim() === "") return session;
  const result = submitGuess(graph, session.game, session.text);
  if (result.kind === "accepted") {
    const review = reviewGame(graph, result.game);
    const announcement = guessAnnouncement(result.card, {
      number: result.game.guesses.length,
      limit: review.limit,
      name: kommunName(graph, result.card.code),
      status: review.status,
    });
    return { game: result.game, text: "", announcement };
  }
  return {
    game: session.game,
    text: result.reason === "unknown" ? session.text : "",
    toast: rejectionMessage(result.reason, session.text.trim()),
  };
}

/** The Ledtråd button: takes the next hint, if any is left, and announces it. */
export function takeSessionHint<T extends Trip>(
  graph: GraphVersion,
  session: GuessSession<T>,
): GuessSession<T> {
  const game = takeHint(graph, session.game);
  if (game === session.game) return session;
  return { ...session, game, announcement: hintAnnouncement(game.hints?.taken ?? 0) };
}

/** Autocomplete for the guess input: fuzzysort-style subsequence matching over folded names. */
export function suggestKommuner(graph: GraphVersion, game: Game, text: string): Suggestion[] {
  const folded = foldKommunName(text);
  if (folded === "") return [];
  const literal = normalizeKommunName(text);

  const scored: { suggestion: Suggestion; score: number }[] = [];
  for (const kommun of graph.kommuner.values()) {
    const score = subsequenceScore(foldKommunName(kommun.name), folded);
    if (score === undefined) continue;
    const literalBonus = normalizeKommunName(kommun.name).includes(literal) ? 1 : 0;
    const disabled = disabledTag(game, kommun.code);
    scored.push({
      suggestion: { code: kommun.code, name: kommun.name, ...(disabled && { disabled }) },
      score: score + literalBonus,
    });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.suggestion.name.localeCompare(b.suggestion.name, "sv"))
    .slice(0, MAX_SUGGESTIONS)
    .map(({ suggestion }) => suggestion);
}

function disabledTag(game: Game, code: KommunCode): SuggestionTag | undefined {
  if (code === game.trip.start) return "start";
  if (code === game.trip.destination) return "mål";
  if (game.guesses.includes(code)) return "redan gissad";
  return undefined;
}

/** A run of a suggestion's name, marked when the typed text matched it. */
export type NameSegment = { text: string; matched: boolean };

/** Splits `name` into runs, marking the letters that made it match `text` in `suggestKommuner`. */
export function matchedSegments(name: string, text: string): NameSegment[] {
  const chars = Array.from(name);
  // Folds each character on its own, remembering which character each folded letter came from.
  const origins: number[] = [];
  let folded = "";
  chars.forEach((char, index) => {
    for (const foldedChar of foldKommunName(char)) {
      folded += foldedChar;
      origins.push(index);
    }
  });

  const query = foldKommunName(text);
  const positions = query === "" ? undefined : subsequenceMatch(folded, query)?.positions;
  const matched = new Set(positions?.map((position) => origins[position]));

  const segments: NameSegment[] = [];
  chars.forEach((char, index) => {
    const isMatched = matched.has(index);
    const last = segments.at(-1);
    if (last && last.matched === isMatched) last.text += char;
    else segments.push({ text: char, matched: isMatched });
  });
  return segments;
}

function subsequenceScore(target: string, query: string): number | undefined {
  return subsequenceMatch(target, query)?.score;
}

/**
 * Scores `query` as a subsequence of `target`, with the matched positions in `target`,
 * or undefined when it isn't one.
 * Like fuzzysort, a prefix beats a substring, and runs of consecutive letters beat scattered ones.
 */
function subsequenceMatch(
  target: string,
  query: string,
): { score: number; positions: number[] } | undefined {
  const substringAt = target.indexOf(query);
  if (substringAt >= 0) {
    const positions = Array.from(query, (_, offset) => substringAt + offset);
    const score = substringAt === 0 ? 1000 - target.length : 500 - substringAt;
    return { score, positions };
  }

  let score = 0;
  let position = -1;
  const positions: number[] = [];
  for (const char of query) {
    const next = target.indexOf(char, position + 1);
    if (next === -1) return undefined;
    score += next === position + 1 ? 10 : -(next - position);
    position = next;
    positions.push(next);
  }
  return { score, positions };
}
