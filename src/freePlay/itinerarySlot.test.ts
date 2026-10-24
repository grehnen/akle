import { describe, expect, test } from "bun:test";
import { type Game, submitGuess } from "../engine/game";
import { timeoutRuns } from "../engine/thinkingTime";
import { tripTime } from "../engine/tripTime";
import { buildGraphVersion } from "../graph/graphVersion";
import { memoryStorage } from "../progress/storage";
import {
  beginItinerary,
  changeTripGame,
  type ItineraryPlay,
  itineraryStage,
  NEW_ITINERARY_PLAY,
  nextTrip,
  startTrip,
} from "./itineraryPlay";
import { type Itinerary, itineraryLinkPath } from "./itineraryLink";
import { resumeItinerary, saveItinerarySlot, unfinishedItinerary } from "./itinerarySlot";
import type { LinkedTrip } from "./linkPayload";

// Nynäshamn ── Haninge ── Salem ── Trosa.
const graph = buildGraphVersion({
  id: "current",
  startsAtTrip: 1,
  kommuner: [
    { code: "0192", name: "Nynäshamn" },
    { code: "0136", name: "Haninge" },
    { code: "0128", name: "Salem" },
    { code: "0488", name: "Trosa" },
  ],
  links: [
    { between: ["0192", "0136"], kind: "land" },
    { between: ["0136", "0128"], kind: "land" },
    { between: ["0128", "0488"], kind: "land" },
  ],
});
const version = { graph, ordinal: 2 };

const trips: LinkedTrip[] = [
  { start: "0192", destination: "0128", mode: { kind: "standard" } },
  { start: "0136", destination: "0488", mode: { kind: "timed", thinkingTime: 10 } },
  { start: "0488", destination: "0136", mode: { kind: "tie-breaker" } },
];
const friday: Itinerary = { version, title: "Fredagsresan", trips };
const save = (storage = memoryStorage(), play: ItineraryPlay, itinerary = friday) => {
  saveItinerarySlot(storage, {
    versionOrdinal: itinerary.version.ordinal,
    title: itinerary.title,
    trips: itinerary.trips,
    play,
  });
  return storage;
};

function guessed(game: Game, ...names: string[]): Game {
  return names.reduce((played, name) => {
    const result = submitGuess(graph, played, name);
    if (result.kind !== "accepted") throw new Error(`${name} was ${result.kind}`);
    return result.game;
  }, game);
}

/** The play after guessing `names` at `now` in the trip on the board. */
function guess(play: ItineraryPlay, now: number, ...names: string[]): ItineraryPlay {
  const stage = itineraryStage(graph, trips, play);
  if (stage.kind !== "trip") throw new Error(`no trip on the board but ${stage.kind}`);
  return changeTripGame(graph, play, guessed(stage.game, ...names), now);
}

const begun = beginItinerary(NEW_ITINERARY_PLAY);
/** The first trip won at 1 s, the second started at 2 s with one wrong guess at 5 s. */
const secondTripPlaying = guess(
  startTrip(trips, nextTrip(graph, guess(startTrip(trips, begun, 0), 1000, "Haninge")), 2000),
  5000,
  "Nynäshamn",
);

describe("the itinerary slot", () => {
  test("resumes the stored itinerary where it was: past results and the current trip", () => {
    const storage = save(memoryStorage(), secondTripPlaying);
    expect(resumeItinerary(storage, friday)).toEqual(secondTripPlaying);
  });

  test("resumes a trip on its card, not yet started", () => {
    const onCard = nextTrip(graph, guess(startTrip(trips, begun, 0), 1000, "Haninge"));
    const resumed = resumeItinerary(save(memoryStorage(), onCard), friday);
    expect(resumed).toEqual(onCard);
    expect(resumed && itineraryStage(graph, trips, resumed)).toEqual({ kind: "card", index: 1 });
  });

  test("resumes a finished itinerary as finished", () => {
    let play = guess(startTrip(trips, nextTrip(graph, secondTripPlaying), 6000), 7000, "Salem");
    play = nextTrip(graph, guess(startTrip(trips, nextTrip(graph, play), 8000), 9000, "Salem"));
    expect(itineraryStage(graph, trips, play)).toEqual({ kind: "finished" });

    expect(resumeItinerary(save(memoryStorage(), play), friday)).toEqual(play);
  });

  test.each<[string, Itinerary]>([
    ["another title", { ...friday, title: "Lördagsresan" }],
    ["no title", { ...friday, title: undefined }],
    ["another version", { ...friday, version: { graph, ordinal: 1 } }],
    ["the trips in another order", { ...friday, trips: [trips[1], trips[0], trips[2]] }],
    ["a trip fewer", { ...friday, trips: trips.slice(0, 2) }],
    [
      "another thinking time",
      {
        ...friday,
        trips: [trips[0], { ...trips[1], mode: { kind: "timed", thinkingTime: 15 } }, trips[2]],
      },
    ],
  ])("doesn't resume an itinerary with %s", (_, other) => {
    const storage = save(memoryStorage(), secondTripPlaying);
    expect(resumeItinerary(storage, other)).toBeUndefined();
  });

  test("keeps nothing for an itinerary not begun, leaving the stored one", () => {
    const storage = save(memoryStorage(), secondTripPlaying);
    const other = { ...friday, title: "Lördagsresan" };
    save(storage, NEW_ITINERARY_PLAY, other);
    expect(resumeItinerary(storage, friday)).toEqual(secondTripPlaying);
    expect(resumeItinerary(storage, other)).toBeUndefined();
  });

  test("a begun itinerary replaces the stored one", () => {
    const storage = save(memoryStorage(), secondTripPlaying);
    const other = { ...friday, title: "Lördagsresan" };
    save(storage, begun, other);
    expect(resumeItinerary(storage, other)).toEqual(begun);
    expect(resumeItinerary(storage, friday)).toBeUndefined();
  });

  test("leaves the trip slot alone", () => {
    const storage = memoryStorage();
    storage.setItem("akle:free-play-trip", "a stored trip");
    save(storage, secondTripPlaying);
    expect(storage.getItem("akle:free-play-trip")).toBe("a stored trip");
  });

  const startedGame = { guesses: [], startedAt: 0 };
  test.each<[string, string | object]>([
    ["text that isn't JSON", "{"],
    ["another format", { format: 2 }],
    ["a trip with a bad mode", { trips: [{ start: "0192", destination: "0128", mode: {} }] }],
    ["a current trip past the end", { play: { current: 4, games: [] } }],
    ["a game too many", { play: { current: 0, games: [startedGame, startedGame] } }],
    ["a game without a start", { play: { current: 0, games: [{ guesses: [] }] } }],
    ["a past trip not over", { play: { current: 1, games: [startedGame] } }],
    [
      "a timed guess without its time",
      {
        play: {
          current: 1,
          games: [
            { guesses: ["0136"], startedAt: 0, wonAt: 1000 },
            { guesses: ["0192"], startedAt: 2000 },
          ],
        },
      },
    ],
  ])("ignores a slot with %s", (_, change) => {
    const storage = save(memoryStorage(), secondTripPlaying);
    const whole = JSON.parse(storage.getItem("akle:itinerary") ?? "");
    storage.setItem(
      "akle:itinerary",
      typeof change === "string" ? change : JSON.stringify({ ...whole, ...change }),
    );
    expect(resumeItinerary(storage, friday)).toBeUndefined();
  });
});

describe("real time across the gap", () => {
  test("a resumed tie-breaker trip's time includes the time away", () => {
    // The tie-breaker trip started at 10 s, the player then away for an hour before the win.
    let play = guess(startTrip(trips, nextTrip(graph, secondTripPlaying), 6000), 7000, "Salem");
    play = startTrip(trips, nextTrip(graph, play), 10_000);
    const resumed = resumeItinerary(save(memoryStorage(), play), friday);
    if (resumed === undefined) throw new Error("not resumed");

    const won = guess(resumed, 10_000 + 3_600_000, "Salem");
    expect(tripTime(won.games[2])).toBe(36_000);
  });

  test("every thinking time that ran out while away is a timeout, uncapped", () => {
    // The timed trip's last guess at 5 s; back 20 minutes later: 120 thinking times of 10 s.
    const resumed = resumeItinerary(save(memoryStorage(), secondTripPlaying), friday);
    if (resumed === undefined) throw new Error("not resumed");
    expect(timeoutRuns(resumed.games[1], 5000 + 1_200_000)).toEqual([0, 120]);

    const won = guess(resumed, 5000 + 1_200_000, "Salem");
    expect(timeoutRuns(won.games[1])).toEqual([0, 120, 0]);
  });
});

describe("the unfinished itinerary", () => {
  test("is the stored itinerary while unfinished: its title, current trip and link", () => {
    const storage = save(memoryStorage(), secondTripPlaying);
    expect(unfinishedItinerary(storage)).toEqual({
      title: "Fredagsresan",
      tripNumber: 2,
      tripCount: 3,
      link: itineraryLinkPath(2, "Fredagsresan", trips),
    });
  });

  test("is there from the first trip's card", () => {
    const storage = save(memoryStorage(), begun, { ...friday, title: undefined });
    expect(unfinishedItinerary(storage)).toEqual({
      tripNumber: 1,
      tripCount: 3,
      link: itineraryLinkPath(2, "", trips),
    });
  });

  test("is nothing once the itinerary is finished, or with none stored", () => {
    let play = guess(startTrip(trips, nextTrip(graph, secondTripPlaying), 6000), 7000, "Salem");
    play = nextTrip(graph, guess(startTrip(trips, nextTrip(graph, play), 8000), 9000, "Salem"));
    expect(unfinishedItinerary(save(memoryStorage(), play))).toBeUndefined();
    expect(unfinishedItinerary(memoryStorage())).toBeUndefined();
  });
});
