import { describe, expect, test } from "bun:test";
import { buildGraphVersion } from "../graph/graphVersion";
import { type Game, giveUp, newGame, reviewGame, type Rules, submitGuess } from "./game";
import { takeHint } from "./hints";
import { tripScore } from "./score";
import { thinkingTimeLeft, timeoutRuns } from "./thinkingTime";
import { stampThinkingTime, startTime } from "./tripTime";

// S ── A ── B ── D: a distance of 2.
const graph = buildGraphVersion({
  id: "test",
  startsAtTrip: 1,
  kommuner: ["S", "A", "B", "D", "Z"].map((code) => ({ code, name: `Kommun ${code}` })),
  links: [
    { between: ["S", "A"], kind: "land" },
    { between: ["A", "B"], kind: "land" },
    { between: ["B", "D"], kind: "land" },
    { between: ["D", "Z"], kind: "land" },
  ],
});
/** Timed, with a thinking time of 10 seconds. */
const timed: Rules = { guessLimit: "distance", giveUp: true, keepsTime: false, thinkingTime: 10 };
const trip = { start: "S", destination: "D" };

const startedAt = Date.UTC(2026, 9, 24, 12, 0, 0);
const seconds = (count: number) => startedAt + count * 1000;

/** Makes a change to the game at a time in seconds after Starta, stamping it as the screen does. */
function at(time: number, change: (game: Game) => Game) {
  return (game: Game) => stampThinkingTime(graph, change(game), seconds(time));
}
const guessing = (name: string) => (game: Game) => {
  const result = submitGuess(graph, game, name);
  if (result.kind !== "accepted") throw new Error(`${name} was ${result.kind}`);
  return result.game;
};
const play = (...changes: ((game: Game) => Game)[]) =>
  changes.reduce((game, change) => change(game), startTime(newGame(trip, timed), startedAt));

describe("the thinking time", () => {
  test("runs from Starta, and runs out after its seconds", () => {
    const started = play();
    expect(thinkingTimeLeft(started, seconds(0))).toBe(10_000);
    expect(thinkingTimeLeft(started, seconds(6.5))).toBe(3_500);
    expect(timeoutRuns(started, seconds(9.999))).toEqual([0]);
    expect(timeoutRuns(started, seconds(10))).toEqual([1]);
  });

  test("starts again after a timeout, with no cap on how many there are", () => {
    const started = play();
    expect(thinkingTimeLeft(started, seconds(13))).toBe(7_000);
    expect(timeoutRuns(started, seconds(55))).toEqual([5]);
  });

  test("a counted guess starts it again", () => {
    const game = play(at(8, guessing("Kommun A")));
    expect(thinkingTimeLeft(game, seconds(15))).toBe(3_000);
    expect(timeoutRuns(game, seconds(15))).toEqual([0, 0]);
  });

  test("a hint neither starts it again nor pauses it", () => {
    const game = play(
      at(8, (current) => takeHint(graph, current)),
      at(9, (current) => takeHint(graph, current)),
    );
    expect(thinkingTimeLeft(game, seconds(12))).toBe(8_000);
    expect(timeoutRuns(game, seconds(12))).toEqual([1]);
  });

  test("timeouts stay where they ran out, between the guesses", () => {
    const game = play(at(25, guessing("Kommun Z")), at(27, guessing("Kommun A")));
    expect(timeoutRuns(game, seconds(58))).toEqual([2, 0, 3]);
  });

  test("every thinking time that ran out while away counts, from the timestamps alone", () => {
    // Hidden, asleep or closed for an hour: nothing counted ticks meanwhile.
    const game = play(at(4, guessing("Kommun A")));
    expect(timeoutRuns(game, seconds(4 + 3600 + 2.5))).toEqual([0, 360]);
    expect(thinkingTimeLeft(game, seconds(4 + 3600 + 2.5))).toBe(7_500);
  });

  test("stops when the trip ends: at the last guess, or at a give-up", () => {
    const won = play(at(3, guessing("Kommun A")), at(14, guessing("Kommun B")));
    expect(timeoutRuns(won, seconds(500))).toEqual([0, 1, 0]);

    const givenUp = play(
      at(3, guessing("Kommun Z")),
      at(5, guessing("Kommun A")),
      at(31, (game) => giveUp(graph, game)),
    );
    expect(timeoutRuns(givenUp, seconds(500))).toEqual([0, 0, 2]);
  });

  test("isn't kept without a thinking time, or before Starta", () => {
    const untimed = { ...timed, thinkingTime: undefined };
    const game = stampThinkingTime(
      graph,
      startTime(newGame(trip, untimed), startedAt),
      seconds(50),
    );
    expect(timeoutRuns(game, seconds(50))).toEqual([0]);
    expect(timeoutRuns(newGame(trip, timed), seconds(50))).toEqual([0]);
  });
});

describe("a timeout", () => {
  test("adds one to the score and uses no guess", () => {
    const game = play(at(25, guessing("Kommun A")), at(27, guessing("Kommun B")));
    const review = reviewGame(graph, game);
    expect(review.status).toBe("won");
    expect(review.cards.length).toBe(2);
    expect(review.timeouts).toBe(2);
    expect(tripScore(review)).toBe(2);
  });

  test("rules out Perfect", () => {
    const perfect = reviewGame(
      graph,
      play(at(5, guessing("Kommun A")), at(9, guessing("Kommun B"))),
    );
    expect(perfect.perfect).toBe(true);
    const late = reviewGame(graph, play(at(5, guessing("Kommun A")), at(15, guessing("Kommun B"))));
    expect(late.perfect).toBe(false);
    expect(tripScore(late)).toBe(1);
  });

  test("adds to a give-up's score too", () => {
    const game = play(
      at(3, guessing("Kommun Z")),
      at(5, guessing("Kommun A")),
      at(31, (current) => giveUp(graph, current)),
    );
    // 2 guesses − distance 2 + 3·1 away + 2 timeouts.
    expect(tripScore(reviewGame(graph, game))).toBe(5);
  });
});
