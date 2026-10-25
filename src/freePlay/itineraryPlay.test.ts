import { describe, expect, test } from "bun:test";
import { type Game, giveUp, submitGuess } from "../engine/game";
import { lanPathGraph } from "../schedule/testGraphs";
import {
  beginItinerary,
  changeTripGame,
  type ItineraryPlay,
  itineraryStage,
  itineraryTotal,
  NEW_ITINERARY_PLAY,
  nextTrip,
  startTrip,
} from "./itineraryPlay";
import type { LinkedTrip } from "./linkPayload";

// 0100 ── 0101 ── 0102 ── 0103 ── 0104
const graph = lanPathGraph(1, 5);
const trips: LinkedTrip[] = [
  { start: "0100", destination: "0102", mode: { kind: "standard" } },
  { start: "0104", destination: "0102", mode: { kind: "timed", thinkingTime: 20 } },
  { start: "0100", destination: "0103", mode: { kind: "unlimited" } },
];

function guessed(game: Game, ...names: string[]): Game {
  return names.reduce((played, name) => {
    const result = submitGuess(graph, played, name);
    if (result.kind !== "accepted") throw new Error(`${name} was ${result.kind}`);
    return result.game;
  }, game);
}

/** The play's game on the trip being played, after guessing `names` in it at `now`. */
function guess(play: ItineraryPlay, now: number, ...names: string[]): ItineraryPlay {
  const stage = itineraryStage(graph, trips, play);
  if (stage.kind !== "trip") throw new Error(`no trip on the board but ${stage.kind}`);
  return changeTripGame(graph, play, guessed(stage.game, ...names), now);
}

/** `Starta resplanen` at 0, which puts the first trip, standard, straight on the board. */
const begun = beginItinerary(trips, NEW_ITINERARY_PLAY, 0);
/** The first trip won at 1, then `Nästa resa` at 2 to the timed second trip's card. */
const onTimedCard = nextTrip(graph, trips, guess(begun, 1, "Kommun 0101"), 2);

describe("playing an itinerary", () => {
  test("opens on its intro, then puts a trip off the clock straight on the board", () => {
    expect(itineraryStage(graph, trips, NEW_ITINERARY_PLAY)).toEqual({ kind: "intro" });
    const stage = itineraryStage(graph, trips, begun);
    expect(stage.kind === "trip" && stage.index).toBe(0);
    expect(stage.kind === "trip" && stage.game.trip).toEqual({
      start: "0100",
      destination: "0102",
    });
  });

  test("a trip on the clock waits on its card for Starta", () => {
    expect(itineraryStage(graph, trips, onTimedCard)).toEqual({ kind: "card", index: 1 });
    const timedFirst = [trips[1], trips[0]];
    expect(
      itineraryStage(graph, timedFirst, beginItinerary(timedFirst, NEW_ITINERARY_PLAY, 0)),
    ).toEqual({
      kind: "card",
      index: 0,
    });
  });

  test("Nästa resa puts a trip off the clock straight on the board", () => {
    let play = startTrip(trips, onTimedCard, 3);
    play = nextTrip(graph, trips, guess(play, 4, "Kommun 0103"), 5);
    const stage = itineraryStage(graph, trips, play);
    expect(stage.kind === "trip" && stage.index).toBe(2);
    expect(stage.kind === "trip" && stage.game.rules.guessLimit).toBe("none");
  });

  test("Starta puts the trip on the board under its own mode's rules, its time started", () => {
    const play = startTrip(trips, onTimedCard, 5000);
    const stage = itineraryStage(graph, trips, play);
    expect(stage.kind).toBe("trip");
    if (stage.kind !== "trip") return;
    expect(stage.index).toBe(1);
    expect(stage.game.trip).toEqual({ start: "0104", destination: "0102" });
    expect(stage.game.rules).toEqual({
      guessLimit: "distance",
      giveUp: true,
      keepsTime: false,
      thinkingTime: 20,
    });
    expect(stage.game.startedAt).toBe(5000);
    expect(stage.over).toBe(false);
  });

  test("a timed trip's guesses are stamped for its thinking time", () => {
    let play = startTrip(trips, onTimedCard, 0);
    play = guess(play, 25_000, "Kommun 0103");
    const stage = itineraryStage(graph, trips, play);
    expect(stage.kind === "trip" && stage.game.guessedAt).toEqual([25_000]);
    expect(stage.kind === "trip" && stage.over).toBe(true);
  });

  test("goes on to the next trip only once the trip is over: no skip", () => {
    expect(nextTrip(graph, trips, begun, 1)).toBe(begun);
    const over = guess(begun, 1, "Kommun 0101");
    expect(itineraryStage(graph, trips, nextTrip(graph, trips, over, 2))).toEqual({
      kind: "card",
      index: 1,
    });
  });

  test("starts each trip once: no retry", () => {
    const playing = guess(begun, 1, "Kommun 0103");
    expect(startTrip(trips, playing, 2)).toBe(playing);
    expect(beginItinerary(trips, playing, 3)).toBe(playing);
  });

  test("the trip on the board is the only one that changes", () => {
    const stage = itineraryStage(graph, trips, guess(begun, 1, "Kommun 0101"));
    if (stage.kind !== "trip") throw new Error("no trip");
    expect(changeTripGame(graph, onTimedCard, stage.game, 2)).toBe(onTimedCard);
  });

  test("finishes after the last trip, its total the sum of the trips' scores", () => {
    // Perfect: −1.
    let play = guess(begun, 1, "Kommun 0101");
    expect(itineraryTotal(graph, play)).toBe(-1);
    // Timed: the one winning guess comes 45 s in, two 20 s thinking times over: +0 and 2 ⏱.
    play = startTrip(trips, nextTrip(graph, trips, play, 0), 0);
    play = guess(play, 45_000, "Kommun 0103");
    expect(itineraryTotal(graph, play)).toBe(-1 + 2);
    // Unlimited, given up with 0102 still missing: 2 guesses − distance 2 + 3·1 away = 3.
    play = nextTrip(graph, trips, play, 50_000);
    play = guess(play, 51_000, "Kommun 0104", "Kommun 0101");
    const stage = itineraryStage(graph, trips, play);
    if (stage.kind !== "trip") throw new Error("no trip");
    expect(stage.over).toBe(false);
    expect(itineraryTotal(graph, play)).toBe(1);
    play = changeTripGame(graph, play, giveUp(graph, stage.game), 52_000);
    expect(itineraryTotal(graph, play)).toBe(-1 + 2 + 3);

    play = nextTrip(graph, trips, play, 53_000);
    expect(itineraryStage(graph, trips, play)).toEqual({ kind: "finished" });
    expect(nextTrip(graph, trips, play, 54_000)).toBe(play);
  });

  test("is one plain value that survives JSON", () => {
    const play = guess(begun, 1, "Kommun 0101");
    expect(JSON.parse(JSON.stringify(play))).toEqual(play);
  });
});
