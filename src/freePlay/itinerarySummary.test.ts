import { describe, expect, test } from "bun:test";
import { type Game, giveUp, submitGuess } from "../engine/game";
import { takeHint } from "../engine/hints";
import { lanPathGraph } from "../schedule/testGraphs";
import {
  beginItinerary,
  changeTripGame,
  type ItineraryPlay,
  itineraryStage,
  NEW_ITINERARY_PLAY,
  nextTrip,
  startTrip,
} from "./itineraryPlay";
import { compareStandings, itinerarySummary } from "./itinerarySummary";
import type { LinkedTrip } from "./linkPayload";

// 0100 ── 0101 ── 0102 ── … ── 0109
const graph = lanPathGraph(1, 10);

type Move = (game: Game) => Game;
const guessing =
  (name: string): Move =>
  (game) => {
    const result = submitGuess(graph, game, name);
    if (result.kind !== "accepted") throw new Error(`${name} was ${result.kind}`);
    return result.game;
  };
const hint: Move = (game) => takeHint(graph, game);
const givingUp: Move = (game) => giveUp(graph, game);

/** Plays every trip in turn: started at `startAt`, each move made at its own time. */
function played(
  trips: readonly LinkedTrip[],
  plays: { startAt: number; moves: [number, Move][] }[],
): ItineraryPlay {
  let play = beginItinerary(NEW_ITINERARY_PLAY);
  for (const { startAt, moves } of plays) {
    play = startTrip(trips, play, startAt);
    for (const [at, move] of moves) {
      const stage = itineraryStage(graph, trips, play);
      if (stage.kind !== "trip") throw new Error(`no trip on the board but ${stage.kind}`);
      play = changeTripGame(graph, play, move(stage.game), at);
    }
    play = nextTrip(graph, play);
  }
  return play;
}

const standard = { kind: "standard" } as const;
const tieBreaker = { kind: "tie-breaker" } as const;

describe("an itinerary's summary", () => {
  test("has a row per trip with its ends, mode, outcome, hints, timeouts and score", () => {
    const trips: LinkedTrip[] = [
      { start: "0100", destination: "0102", mode: standard },
      { start: "0104", destination: "0102", mode: { kind: "timed", thinkingTime: 20 } },
      { start: "0100", destination: "0103", mode: { kind: "unlimited" } },
    ];
    const play = played(trips, [
      // Perfect: −1.
      { startAt: 0, moves: [[1, guessing("Kommun 0101")]] },
      // A hint, then a wrong guess and the winning one 45 s in: +1, 1 hint, 2 ⏱ = 4.
      {
        startAt: 0,
        moves: [
          [1, hint],
          [2, guessing("Kommun 0101")],
          [45_000, guessing("Kommun 0103")],
        ],
      },
      // Given up with 0102 missing: 2 guesses − distance 2 + 3·1 away = 3.
      {
        startAt: 0,
        moves: [
          [1, guessing("Kommun 0104")],
          [2, guessing("Kommun 0101")],
          [3, givingUp],
        ],
      },
    ]);

    const summary = itinerarySummary(graph, trips, play);

    expect(summary?.rows).toEqual([
      {
        mode: standard,
        start: "Kommun 0100",
        destination: "Kommun 0102",
        outcome: { kind: "perfect", extra: 0 },
        hintsUsed: 0,
        timeouts: 0,
        score: -1,
      },
      {
        mode: { kind: "timed", thinkingTime: 20 },
        start: "Kommun 0104",
        destination: "Kommun 0102",
        outcome: { kind: "won", extra: 1, hintsUsed: 1, timeouts: 2 },
        hintsUsed: 1,
        timeouts: 2,
        score: 4,
      },
      {
        mode: { kind: "unlimited" },
        start: "Kommun 0100",
        destination: "Kommun 0103",
        outcome: { kind: "lost", away: 1, hintsUsed: 0, givenUp: true },
        hintsUsed: 0,
        timeouts: 0,
        score: 3,
      },
    ]);
    expect(summary?.standing).toEqual({ score: 6, wonTieBreakers: 0, totalTime: 0 });
    expect(summary?.hasTieBreaker).toBe(false);
  });

  test("adds only won tie-breaker trips' times, a lost one adding none", () => {
    const trips: LinkedTrip[] = [
      { start: "0100", destination: "0102", mode: tieBreaker },
      { start: "0100", destination: "0102", mode: tieBreaker },
      { start: "0104", destination: "0102", mode: tieBreaker },
      { start: "0100", destination: "0102", mode: standard },
    ];
    const play = played(trips, [
      // Won 12.34 s in: 123 tenths.
      { startAt: 1000, moves: [[13_340, guessing("Kommun 0101")]] },
      // Lost at the guess limit of 5, 0101 missing: no time.
      {
        startAt: 20_000,
        moves: ["0105", "0106", "0107", "0108", "0109"].map((code, index) => [
          21_000 + index,
          guessing(`Kommun ${code}`),
        ]),
      },
      // Won after an hour: 36 000 tenths and a bit.
      { startAt: 30_000, moves: [[3_630_050, guessing("Kommun 0103")]] },
      { startAt: 0, moves: [[1, guessing("Kommun 0101")]] },
    ]);

    const summary = itinerarySummary(graph, trips, play);

    expect(summary?.rows.map((row) => row.time)).toEqual([123, undefined, 36_000, undefined]);
    expect(summary?.rows[1]?.outcome).toEqual({ kind: "lost", away: 1, hintsUsed: 0 });
    expect(summary?.standing).toEqual({
      // Perfect, then 5 guesses − distance 1 + 2·1 away, Perfect and Perfect.
      score: -1 + (5 - 1 + 2 * 1) - 1 - 1,
      wonTieBreakers: 2,
      totalTime: 36_123,
    });
    expect(summary?.hasTieBreaker).toBe(true);
  });

  test("with every tie-breaker trip lost, has a tie-breaker but no time", () => {
    const trips: LinkedTrip[] = [
      { start: "0100", destination: "0102", mode: tieBreaker },
      { start: "0100", destination: "0102", mode: standard },
    ];
    const play = played(trips, [
      {
        startAt: 0,
        moves: [
          [1, guessing("Kommun 0104")],
          [2, givingUp],
        ],
      },
      { startAt: 0, moves: [[1, guessing("Kommun 0101")]] },
    ]);

    const summary = itinerarySummary(graph, trips, play);

    // Given up after 1 guess on distance 1 with 0101 away: 1 − 1 + 3·1, then Perfect.
    expect(summary?.standing).toEqual({ score: 3 - 1, wonTieBreakers: 0, totalTime: 0 });
    expect(summary?.hasTieBreaker).toBe(true);
  });

  test("exists only once the last trip is over", () => {
    const trips: LinkedTrip[] = [
      { start: "0100", destination: "0102", mode: standard },
      { start: "0100", destination: "0102", mode: standard },
    ];
    const first = played(trips, [{ startAt: 0, moves: [[1, guessing("Kommun 0101")]] }]);
    expect(itinerarySummary(graph, trips, NEW_ITINERARY_PLAY)).toBeUndefined();
    expect(itinerarySummary(graph, trips, first)).toBeUndefined();
  });

  test("comes from the stored play alone, after a round trip through JSON", () => {
    const trips: LinkedTrip[] = [
      { start: "0100", destination: "0102", mode: tieBreaker },
      { start: "0100", destination: "0102", mode: standard },
    ];
    const play = played(trips, [
      { startAt: 0, moves: [[5_000, guessing("Kommun 0101")]] },
      { startAt: 0, moves: [[1, guessing("Kommun 0101")]] },
    ]);
    const stored: ItineraryPlay = JSON.parse(JSON.stringify(play));
    expect(itinerarySummary(graph, trips, stored)).toEqual(itinerarySummary(graph, trips, play));
  });
});

describe("ranking two itinerary results", () => {
  const standing = (score: number, wonTieBreakers = 0, totalTime = 0) => ({
    score,
    wonTieBreakers,
    totalTime,
  });
  const ranked = (...standings: ReturnType<typeof standing>[]) =>
    [...standings].sort(compareStandings);

  test("puts the lower score first, whatever the time", () => {
    expect(ranked(standing(5, 2, 100), standing(4, 0, 0))).toEqual([
      standing(4, 0, 0),
      standing(5, 2, 100),
    ]);
  });

  test("separates equal scores by more won tie-breaker trips, even with more time", () => {
    expect(ranked(standing(4, 1, 100), standing(4, 2, 900))).toEqual([
      standing(4, 2, 900),
      standing(4, 1, 100),
    ]);
  });

  test("then by lower total time", () => {
    expect(ranked(standing(4, 2, 901), standing(4, 2, 900))).toEqual([
      standing(4, 2, 900),
      standing(4, 2, 901),
    ]);
  });

  test("ties when score, won tie-breaker trips and total time are all equal", () => {
    expect(compareStandings(standing(4, 2, 900), standing(4, 2, 900))).toBe(0);
  });
});
