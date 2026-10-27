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
import {
  latestItineraryVersion,
  resumeItinerary,
  saveItinerary,
  unfinishedItinerary,
} from "./itinerarySaves";
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
  saveItinerary(storage, {
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

/** `Starta resplanen` at 0, which puts the first trip, standard, straight on the board. */
const begun = beginItinerary(trips, NEW_ITINERARY_PLAY, 0);
/** The first trip won at 1 s, then `Nästa resa` to the timed second trip's card. */
const onCard = nextTrip(graph, trips, guess(begun, 1000, "Haninge"), 1500);
/** The second trip started at 2 s with one wrong guess at 5 s. */
const secondTripPlaying = guess(startTrip(trips, onCard, 2000), 5000, "Nynäshamn");
/** On to the tie-breaker third trip's card, the second won at 7 s. */
const onThirdCard = nextTrip(graph, trips, guess(secondTripPlaying, 7000, "Salem"), 7500);
/** The third trip won after starting at 8 s, then `Visa sammanfattning →`. */
const finished = nextTrip(
  graph,
  trips,
  guess(startTrip(trips, onThirdCard, 8000), 9000, "Salem"),
  9500,
);

describe("an itinerary's save", () => {
  test("resumes the stored itinerary where it was: past results and the current trip", () => {
    const storage = save(memoryStorage(), secondTripPlaying);
    expect(resumeItinerary(storage, friday)).toEqual(secondTripPlaying);
  });

  test("resumes a trip on its card, not yet started", () => {
    const resumed = resumeItinerary(save(memoryStorage(), onCard), friday);
    expect(resumed).toEqual(onCard);
    expect(resumed && itineraryStage(graph, trips, resumed)).toEqual({ kind: "card", index: 1 });
  });

  test("resumes a finished itinerary as finished", () => {
    expect(itineraryStage(graph, trips, finished)).toEqual({ kind: "finished" });
    expect(resumeItinerary(save(memoryStorage(), finished), friday)).toEqual(finished);
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

  test("beginning another itinerary leaves this one, which its link resumes as it was", () => {
    const storage = save(memoryStorage(), secondTripPlaying);
    const other = { ...friday, title: "Lördagsresan" };
    save(storage, begun, other);
    expect(resumeItinerary(storage, other)).toEqual(begun);
    expect(resumeItinerary(storage, friday)).toEqual(secondTripPlaying);
  });

  test("saving the same itinerary again replaces its save", () => {
    const storage = save(memoryStorage(), secondTripPlaying);
    save(storage, finished);
    expect(resumeItinerary(storage, friday)).toEqual(finished);
  });

  test("leaves trips' saves alone", () => {
    const storage = memoryStorage();
    storage.setItem("akle:free-play-trips", "stored trips");
    save(storage, secondTripPlaying);
    expect(storage.getItem("akle:free-play-trips")).toBe("stored trips");
  });

  test("a trip of the itinerary is never a trip save", () => {
    const storage = save(memoryStorage(), secondTripPlaying);
    expect(storage.getItem("akle:free-play-trips")).toBeNull();
  });

  const startedGame = { guesses: [], startedAt: 0 };
  test.each<[string, string | object]>([
    ["no record", "a save"],
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
  ])("ignores a save with %s, leaving the others readable", (_, change) => {
    const other = { ...friday, title: "Lördagsresan" };
    const storage = save(save(memoryStorage(), begun, other), secondTripPlaying);
    const { saves } = JSON.parse(storage.getItem("akle:itineraries") ?? "");
    const broken = typeof change === "string" ? change : { ...saves[0], ...change };
    storage.setItem("akle:itineraries", JSON.stringify({ format: 1, saves: [broken, saves[1]] }));
    expect(resumeItinerary(storage, friday)).toBeUndefined();
    expect(resumeItinerary(storage, other)).toEqual(begun);
  });

  test.each([
    ["no JSON", "{"],
    ["an unknown format", JSON.stringify({ format: 2, saves: [] })],
    ["no list of saves", JSON.stringify({ format: 1 })],
  ])("reads stored saves with %s as none", (_, text) => {
    const storage = memoryStorage();
    storage.setItem("akle:itineraries", text);
    expect(resumeItinerary(storage, friday)).toBeUndefined();
    expect(unfinishedItinerary(storage, version)).toBeUndefined();
  });
});

describe("real time across the gap", () => {
  test("a resumed tie-breaker trip's time includes the time away", () => {
    // The tie-breaker trip started at 10 s, the player then away for an hour before the win.
    const play = startTrip(trips, onThirdCard, 10_000);
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
    expect(unfinishedItinerary(storage, version)).toEqual({
      title: "Fredagsresan",
      tripNumber: 2,
      tripCount: 3,
      link: itineraryLinkPath(2, "Fredagsresan", trips),
    });
  });

  test("is there from the first trip on", () => {
    const storage = save(memoryStorage(), begun, { ...friday, title: undefined });
    expect(unfinishedItinerary(storage, version)).toEqual({
      tripNumber: 1,
      tripCount: 3,
      link: itineraryLinkPath(2, "", trips),
    });
  });

  test("is nothing once the itinerary is finished, or with none stored", () => {
    expect(unfinishedItinerary(save(memoryStorage(), finished), version)).toBeUndefined();
    expect(unfinishedItinerary(memoryStorage(), version)).toBeUndefined();
  });

  test("at a trip's result, before Nästa resa, names the next trip", () => {
    const firstTripWon = guess(begun, 1000, "Haninge");
    expect(unfinishedItinerary(save(memoryStorage(), firstTripWon), version)?.tripNumber).toBe(2);
  });

  test("at the last trip's result, before Visa sammanfattning →, still names the last trip", () => {
    const lastTripWon = guess(startTrip(trips, onThirdCard, 8000), 9000, "Salem");
    expect(unfinishedItinerary(save(memoryStorage(), lastTripWon), version)?.tripNumber).toBe(3);
  });

  test("is nothing for a save that can't be resumed on its version", () => {
    const storage = save(memoryStorage(), secondTripPlaying);
    expect(unfinishedItinerary(storage, { ...version, ordinal: 3 })).toBeUndefined();
    expect(latestItineraryVersion(storage)).toBe(2);
    expect(latestItineraryVersion(memoryStorage())).toBeUndefined();
  });

  test("is only ever the most recently played, never an older unfinished one", () => {
    const storage = save(memoryStorage(), secondTripPlaying);
    save(storage, finished, { ...friday, title: "Lördagsresan" });
    expect(unfinishedItinerary(storage, version)).toBeUndefined();

    resumeItinerary(storage, friday);
    expect(unfinishedItinerary(storage, version)?.title).toBe("Fredagsresan");
  });
});

describe("past the cap of 50 itineraries", () => {
  // Distinct itineraries by their title.
  const titled = (number: number) => ({ ...friday, title: `Resa ${number}` });
  const isKept = (storage: ReturnType<typeof memoryStorage>, number: number) =>
    resumeItinerary(storage, titled(number)) !== undefined;

  test("the 51st itinerary drops the least recently played, keeping 50", () => {
    const storage = memoryStorage();
    for (let number = 1; number <= 51; number++) save(storage, begun, titled(number));
    expect(JSON.parse(storage.getItem("akle:itineraries") ?? "").saves).toHaveLength(50);
    expect(isKept(storage, 1)).toBe(false);
    expect(isKept(storage, 2)).toBe(true);
    expect(isKept(storage, 51)).toBe(true);
  });

  test("reopening a save protects it from being the next dropped", () => {
    const storage = memoryStorage();
    for (let number = 1; number <= 50; number++) save(storage, begun, titled(number));
    expect(isKept(storage, 1)).toBe(true);
    save(storage, begun, titled(51));
    expect(isKept(storage, 2)).toBe(false);
    expect(isKept(storage, 1)).toBe(true);
  });
});

describe("an itinerary slot from before the upgrade", () => {
  const oldSlot = () => {
    const { saves } = JSON.parse(
      save(memoryStorage(), secondTripPlaying).getItem("akle:itineraries") ?? "",
    );
    return { format: 1, ...saves[0] };
  };

  test("becomes the most recently played save, resumed from its link, and the old key goes", () => {
    const storage = memoryStorage();
    storage.setItem("akle:itinerary", JSON.stringify(oldSlot()));
    expect(unfinishedItinerary(storage, version)?.title).toBe("Fredagsresan");
    expect(resumeItinerary(storage, friday)).toEqual(secondTripPlaying);
    expect(storage.getItem("akle:itinerary")).toBeNull();
  });

  test.each([
    ["no JSON", "{"],
    ["an unknown format", JSON.stringify({ ...oldSlot(), format: 2 })],
    ["no trips", JSON.stringify({ ...oldSlot(), trips: undefined })],
  ])("with %s is dropped quietly", (_, text) => {
    const storage = memoryStorage();
    storage.setItem("akle:itinerary", text);
    expect(resumeItinerary(storage, friday)).toBeUndefined();
    expect(unfinishedItinerary(storage, version)).toBeUndefined();
    expect(storage.getItem("akle:itinerary")).toBeNull();
  });
});
