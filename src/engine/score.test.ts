import { describe, expect, test } from "bun:test";
import { pathCode, pathGraph } from "../schedule/testGraphs";
import { type Game, newGame, reviewGame, submitGuess } from "./game";
import { takeHint } from "./hints";
import { tripScore } from "./score";

// k00 – k01 – … – k11; the trip k00 → k04 has a distance of 3 and a guess limit of 7.
const graph = pathGraph(12);
const trip = { start: pathCode(0), destination: pathCode(4) };

/** Plays guesses by path position, taking a hint at each "hint". */
function played(...steps: (number | "hint")[]): Game {
  let game = newGame(trip);
  for (const step of steps) {
    if (step === "hint") {
      game = takeHint(graph, game);
      continue;
    }
    const result = submitGuess(graph, game, `Kommun ${pathCode(step)}`);
    if (result.kind !== "accepted") throw new Error(`guess ${step} was ${result.reason}`);
    game = result.game;
  }
  return game;
}

const scoreOf = (game: Game) => tripScore(reviewGame(graph, game));

describe("a free-play trip's score", () => {
  test("a win scores its extra plus one per hint", () => {
    expect(scoreOf(played(1, "hint", 7, 2, 3))).toBe(2);
  });

  test("a win with no extra scores 0 when it isn't Perfect", () => {
    // k03 before k02 is 🟩, not ✅, so this win is not Perfect.
    expect(scoreOf(played(1, 3, 2))).toBe(0);
  });

  test("a Perfect scores −1", () => {
    expect(scoreOf(played(1, 2, 3))).toBe(-1);
  });

  test("a loss at the guess limit scores guesses − distance + 2·away + hints", () => {
    // 7 guesses, 2 still away: 7 − 3 + 2·2.
    expect(scoreOf(played(1, 5, 6, 7, 8, 9, 10))).toBe(8);
    expect(scoreOf(played(1, "hint", 5, 6, 7, 8, 9, 10))).toBe(9);
  });

  test("a trip still being played has no score yet", () => {
    expect(scoreOf(played(1))).toBeUndefined();
  });
});
