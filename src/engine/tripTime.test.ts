import { describe, expect, test } from "bun:test";
import { buildGraphVersion } from "../graph/graphVersion";
import { giveUp, newGame, type Rules, submitGuess } from "./game";
import { elapsedTime, startTime, stopTimeAtWin, tripTime } from "./tripTime";

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
const timeKept: Rules = { guessLimit: "distance", giveUp: true, keepsTime: true };
const trip = { start: "S", destination: "D" };

const startedAt = Date.UTC(2026, 9, 24, 12, 0, 0);
const seconds = (count: number) => startedAt + count * 1000;

/** Plays guesses in order, each at its time in seconds after the start, stopping the time. */
function playAt(rules: Rules, ...guesses: [string, number][]) {
  let game = startTime(newGame(trip, rules), startedAt);
  for (const [name, at] of guesses) {
    const result = submitGuess(graph, game, name);
    if (result.kind !== "accepted") throw new Error(`${name} was ${result.kind}`);
    game = stopTimeAtWin(graph, result.game, seconds(at));
  }
  return game;
}

describe("a trip's time", () => {
  test("runs from Starta to the winning guess, kept to tenths", () => {
    const won = playAt(timeKept, ["Kommun A", 20], ["Kommun B", 83.47]);
    expect(tripTime(won)).toBe(834);
  });

  test("is elapsed real time between timestamps, however long the player was away", () => {
    // Hidden, asleep or reloaded for two hours between the guesses: nothing counts ticks.
    const won = playAt(timeKept, ["Kommun A", 5], ["Kommun B", 2 * 3600 + 1.25]);
    expect(tripTime(won)).toBe(72_012);
  });

  test("the running clock reads the time since Starta, and stops at the win", () => {
    const playing = playAt(timeKept, ["Kommun A", 20]);
    expect(elapsedTime(playing, seconds(61.9))).toBe(61_900);

    const won = playAt(timeKept, ["Kommun A", 20], ["Kommun B", 30]);
    expect(elapsedTime(won, seconds(500))).toBe(30_000);
  });

  test("a clock set back before Starta reads no time rather than less than none", () => {
    expect(elapsedTime(startTime(newGame(trip, timeKept), startedAt), startedAt - 5000)).toBe(0);
  });

  test("a loss or a give-up keeps no time", () => {
    const playing = playAt(timeKept, ["Kommun Z", 10], ["Kommun A", 20]);
    const givenUp = stopTimeAtWin(graph, giveUp(graph, playing), seconds(30));
    expect(tripTime(givenUp)).toBeUndefined();
  });

  test("is not kept under rules that keep none, or before Starta", () => {
    const untimed = playAt({ ...timeKept, keepsTime: false }, ["Kommun A", 20], ["Kommun B", 30]);
    expect(tripTime(untimed)).toBeUndefined();

    const notStarted = newGame(trip, timeKept);
    const result = submitGuess(graph, notStarted, "Kommun A");
    expect(result.kind === "accepted" && tripTime(result.game)).toBeFalsy();
  });

  test("a win's time is stopped once; later stamps leave it as it was", () => {
    const won = playAt(timeKept, ["Kommun A", 20], ["Kommun B", 30]);
    expect(tripTime(stopTimeAtWin(graph, won, seconds(90)))).toBe(300);
  });
});
