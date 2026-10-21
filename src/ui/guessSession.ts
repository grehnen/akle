import { type Game, submitGuess } from "../engine/game";
import { foldKommunName, normalizeKommunName, resolveKommunName } from "../engine/kommunNames";
import type { GraphVersion, KommunCode } from "../graph/graphVersion";
import { rejectionMessage } from "./messages";

/** Why a suggestion can't be picked, shown as its tag. */
export type SuggestionTag = "redan gissad" | "start" | "mål";

export type Suggestion = {
  code: KommunCode;
  name: string;
  disabled?: SuggestionTag;
};

const MAX_SUGGESTIONS = 8;

/** The play screen's input state: the game, the typed text, the arrow highlight and the toast. */
export type GuessSession = {
  game: Game;
  text: string;
  highlighted?: KommunCode;
  toast?: string;
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
 * The two-step guess input: picking a suggestion only fills the field, and only an exact
 * match is submitted. Rejected guesses show a toast and are not counted.
 */
export function applyGuessInput(
  graph: GraphVersion,
  session: GuessSession,
  event: GuessInputEvent,
): GuessSession {
  switch (event.type) {
    case "type":
      return { ...session, text: event.text, highlighted: undefined };
    case "arrow":
      return moveHighlight(pickable(graph, session), session, event.direction);
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

function pressEnter(graph: GraphVersion, session: GuessSession): GuessSession {
  const options = pickable(graph, session);
  const highlighted = options.find((s) => s.code === session.highlighted);
  if (highlighted) return fill(session, highlighted);
  if (resolveKommunName(graph, session.text) !== undefined) return submit(graph, session);

  const suggestions = suggestKommuner(graph, session.game, session.text);
  const top = options[0] ?? suggestions[0];
  return top ? fill(session, top) : submit(graph, session);
}

function moveHighlight(
  options: readonly Suggestion[],
  session: GuessSession,
  direction: "up" | "down",
): GuessSession {
  if (options.length === 0) return session;
  const current = options.findIndex((s) => s.code === session.highlighted);
  const step = direction === "down" ? 1 : -1;
  const next =
    current === -1
      ? direction === "down"
        ? 0
        : options.length - 1
      : (current + step + options.length) % options.length;
  return { ...session, highlighted: options[next]?.code };
}

function fill(session: GuessSession, suggestion: Suggestion): GuessSession {
  return { ...session, text: suggestion.name, highlighted: undefined };
}

function pickable(graph: GraphVersion, session: GuessSession): Suggestion[] {
  return suggestKommuner(graph, session.game, session.text).filter((s) => !s.disabled);
}

function submit(graph: GraphVersion, session: GuessSession): GuessSession {
  if (session.text.trim() === "") return session;
  const result = submitGuess(graph, session.game, session.text);
  if (result.kind === "accepted") return { game: result.game, text: "" };
  return {
    game: session.game,
    text: result.reason === "unknown" ? session.text : "",
    toast: rejectionMessage(result.reason, session.text.trim()),
  };
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
  if (code === game.puzzle.start) return "start";
  if (code === game.puzzle.destination) return "mål";
  if (game.guesses.includes(code)) return "redan gissad";
  return undefined;
}

/**
 * Scores `query` as a subsequence of `target`, or undefined when it isn't one.
 * Like fuzzysort, a prefix beats a substring, and runs of consecutive letters beat scattered ones.
 */
function subsequenceScore(target: string, query: string): number | undefined {
  const substringAt = target.indexOf(query);
  if (substringAt === 0) return 1000 - target.length;
  if (substringAt > 0) return 500 - substringAt;

  let score = 0;
  let position = -1;
  for (const char of query) {
    const next = target.indexOf(char, position + 1);
    if (next === -1) return undefined;
    score += next === position + 1 ? 10 : -(next - position);
    position = next;
  }
  return score;
}
