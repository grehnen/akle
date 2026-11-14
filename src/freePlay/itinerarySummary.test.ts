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
import { tripOutcomeLabel } from "./shareText";

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
  let play = NEW_ITINERARY_PLAY;
  let lastAt = 0;
  for (const { startAt, moves } of plays) {
    // A trip on the clock waits on its card for Starta; one off it is on the board already.
    play = play.begun
      ? nextTrip(graph, trips, play, startAt)
      : beginItinerary(trips, play, startAt);
    play = startTrip(trips, play, startAt);
    for (const [at, move] of moves) {
      const stage = itineraryStage(graph, trips, play);
      if (stage.kind !== "trip") throw new Error(`no trip on the board but ${stage.kind}`);
      play = changeTripGame(graph, play, move(stage.game), at);
      lastAt = at;
    }
  }
  return nextTrip(graph, trips, play, lastAt);
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
    expect(summary?.standing).toEqual({
      tripsWon: 2,
      score: 6,
      tieBreakerTime: 0,
    });
  });

  test("keeps each won tie-breaker trip's time, a lost one having none, and sums them, a loss as 5 minutes", () => {
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
      tripsWon: 3,
      // Perfect, then 5 guesses − distance 1 + 2·1 away, Perfect and Perfect.
      score: -1 + (5 - 1 + 2 * 1) - 1 - 1,
      // 12.3 s and an hour, the lost trip counting as 5 minutes (3000 tenths).
      tieBreakerTime: 123 + 3000 + 36_000,
    });
  });

  test("counts a given-up tie-breaker trip as 5 minutes", () => {
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
    expect(summary?.standing).toEqual({
      tripsWon: 1,
      score: 3 - 1,
      tieBreakerTime: 3000,
    });
  });

  test("counts a slow tie-breaker win at its real time, uncapped", () => {
    const trips: LinkedTrip[] = [{ start: "0100", destination: "0102", mode: tieBreaker }];
    // Won 10 minutes in: 6000 tenths, over the 5 minutes a loss counts as.
    const play = played(trips, [{ startAt: 0, moves: [[600_000, guessing("Kommun 0101")]] }]);

    expect(itinerarySummary(graph, trips, play)?.standing.tieBreakerTime).toBe(6000);
  });

  test("keeps a Perfect trip's timeouts in its label and its score", () => {
    const trips: LinkedTrip[] = [
      { start: "0104", destination: "0102", mode: { kind: "timed", thinkingTime: 20 } },
    ];
    // The one winning guess comes 45 s in, two 20 s thinking times over.
    const play = played(trips, [{ startAt: 0, moves: [[45_000, guessing("Kommun 0103")]] }]);

    const row = itinerarySummary(graph, trips, play)?.rows[0];

    expect(row && tripOutcomeLabel(row.outcome)).toBe("+0 (Perfekt, 2 ⏱)");
    expect(row?.score).toBe(-1 + 2);
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

describe("ranking two itineraries' standings", () => {
  const standing = (tripsWon: number, score: number, tieBreakerTime = 0) => ({
    tripsWon,
    score,
    tieBreakerTime,
  });
  const ranked = (...standings: ReturnType<typeof standing>[]) =>
    [...standings].sort(compareStandings);

  test("puts more trips won first, whatever the score or time", () => {
    expect(ranked(standing(2, -5, 100), standing(3, 9, 900))).toEqual([
      standing(3, 9, 900),
      standing(2, -5, 100),
    ]);
  });

  test("separates equal trips won by the lower summed score, whatever the time", () => {
    expect(ranked(standing(3, 5, 100), standing(3, 4, 900))).toEqual([
      standing(3, 4, 900),
      standing(3, 5, 100),
    ]);
  });

  test("then by the lower summed tie-breaker time", () => {
    expect(ranked(standing(3, 4, 901), standing(3, 4, 900))).toEqual([
      standing(3, 4, 900),
      standing(3, 4, 901),
    ]);
  });

  test("ties when the summed tie-breaker time is equal, as with no tie-breaker trips", () => {
    expect(compareStandings(standing(3, 4, 900), standing(3, 4, 900))).toBe(0);
    expect(compareStandings(standing(3, 4), standing(3, 4))).toBe(0);
  });
});
