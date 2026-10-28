import { describe, expect, test } from "bun:test";
import { buildGraphVersion } from "../graph/graphVersion";
import {
  DAILY_RULES,
  type Game,
  giveUp,
  newGame,
  reviewGame,
  type Rules,
  submitGuess,
} from "./game";

/*
 * S ── A ── B ── D        shortest route S-A-B-D, N = 2, guess limit 6
 * S ── P ── Q ── R ── D   one kommun longer
 * R ── Z ── W1 ── W2 ── W3   far away
 * S ~~ F ~~ D             F is a dead end linked only by ferry
 */
const graph = buildGraphVersion({
  id: "test",
  startsAtTrip: 1,
  kommuner: ["S", "A", "B", "D", "P", "Q", "R", "Z", "W1", "W2", "W3", "F"].map((code) => ({
    code,
    name: `Kommun ${code}`,
  })),
  links: [
    { between: ["S", "A"], kind: "land" },
    { between: ["A", "B"], kind: "land" },
    { between: ["B", "D"], kind: "land" },
    { between: ["S", "P"], kind: "land" },
    { between: ["P", "Q"], kind: "land" },
    { between: ["Q", "R"], kind: "land" },
    { between: ["R", "D"], kind: "land" },
    { between: ["R", "Z"], kind: "land" },
    { between: ["Z", "W1"], kind: "land" },
    { between: ["W1", "W2"], kind: "land" },
    { between: ["W2", "W3"], kind: "land" },
    { between: ["S", "F"], kind: "ferry" },
    { between: ["F", "D"], kind: "ferry" },
  ],
});

// A trip is only its endpoints; a daily trip's number lives outside the engine.
const trip = { start: "S", destination: "D" };

const play = (...inputs: string[]): Game => playUnder(DAILY_RULES, ...inputs);

function playUnder(rules: Rules, ...inputs: string[]): Game {
  let game = newGame(trip, rules);
  for (const input of inputs) {
    const result = submitGuess(graph, game, input);
    if (result.kind !== "accepted") {
      throw new Error(`Guess ${input} was rejected: ${result.reason}`);
    }
    game = result.game;
  }
  return game;
}

const feedbackOf = (game: Game) => reviewGame(graph, game).cards.map((card) => card.feedback);

describe("a new game", () => {
  test("knows N and the guess limit", () => {
    const review = reviewGame(graph, newGame(trip));
    expect(review.n).toBe(2);
    expect(review.limit).toBe(6);
    expect(review.status).toBe("playing");
  });
});

describe("feedback", () => {
  test("✅ for a guess on a shortest route that is connected to the start", () => {
    expect(feedbackOf(play("Kommun A"))).toEqual(["✅"]);
  });

  test("🟩 for a guess on a shortest route that is not connected yet", () => {
    expect(feedbackOf(play("Kommun B"))).toEqual(["🟩"]);
  });

  test("🟧 for a guess whose detour costs at most one more kommun", () => {
    expect(feedbackOf(play("Kommun P"))).toEqual(["🟧"]);
  });

  test("🟥 for a guess farther off", () => {
    expect(feedbackOf(play("Kommun Z"))).toEqual(["🟥"]);
  });

  test("🟥 for a dead end, which never connects anything", () => {
    expect(feedbackOf(play("Kommun F"))).toEqual(["🟥"]);
  });

  test("distances count only kommuner not yet guessed", () => {
    // With P and Q guessed, S-P-Q-R-D needs only R, so R lies on the new shortest route.
    expect(feedbackOf(play("Kommun P", "Kommun Q", "Kommun R"))).toEqual(["🟧", "✅", "✅"]);
  });

  test("a guess can become connected later, keeping its feedback", () => {
    const beforeLink = reviewGame(graph, play("Kommun B"));
    expect(beforeLink.cards).toEqual([{ code: "B", feedback: "🟩", connected: false }]);

    const afterLink = reviewGame(graph, play("Kommun B", "Kommun A"));
    expect(afterLink.cards).toEqual([
      { code: "B", feedback: "🟩", connected: true },
      { code: "A", feedback: "✅", connected: true },
    ]);
  });
});

describe("winning and losing", () => {
  test("guessing a shortest route in order from the start is Perfect", () => {
    const review = reviewGame(graph, play("Kommun A", "Kommun B"));
    expect(review.status).toBe("won");
    expect(review.extra).toBe(0);
    expect(review.perfect).toBe(true);
  });

  test("guessing a shortest route out of order wins with +0 but is not Perfect", () => {
    const review = reviewGame(graph, play("Kommun B", "Kommun A"));
    expect(review.status).toBe("won");
    expect(review.extra).toBe(0);
    expect(review.perfect).toBe(false);
  });

  test("extra counts the guesses beyond N", () => {
    const review = reviewGame(graph, play("Kommun Z", "Kommun A", "Kommun B"));
    expect(review.status).toBe("won");
    expect(review.extra).toBe(1);
    expect(review.perfect).toBe(false);
  });

  test("a winning last guess wins", () => {
    const review = reviewGame(
      graph,
      play("Kommun Z", "Kommun F", "Kommun W1", "Kommun W2", "Kommun A", "Kommun B"),
    );
    expect(review.cards).toHaveLength(6);
    expect(review.limit).toBe(6);
    expect(review.status).toBe("won");
    expect(review.extra).toBe(4);
  });

  test("reaching the limit without a route loses, listing the missing kommuner", () => {
    const review = reviewGame(
      graph,
      play("Kommun Z", "Kommun F", "Kommun W1", "Kommun W2", "Kommun W3", "Kommun A"),
    );
    expect(review.status).toBe("lost");
    expect(review.away).toBe(1);
    expect(review.missing).toEqual(["B"]);
    expect(review.extra).toBeUndefined();
    expect(review.perfect).toBe(false);
  });

  test("while playing, away counts the kommuner still needed", () => {
    const review = reviewGame(graph, play("Kommun A"));
    expect(review.status).toBe("playing");
    expect(review.away).toBe(1);
  });
});

describe("with no guess limit", () => {
  const unlimited: Rules = { guessLimit: "none", giveUp: false, keepsTime: false };
  const farOff = ["Kommun Z", "Kommun F", "Kommun W1", "Kommun W2", "Kommun W3", "Kommun P"];

  test("has no limit to show", () => {
    expect(reviewGame(graph, newGame(trip, unlimited)).limit).toBeUndefined();
  });

  test("keeps playing past the standard guess limit", () => {
    const review = reviewGame(graph, playUnder(unlimited, ...farOff, "Kommun Q"));
    expect(review.cards).toHaveLength(7);
    expect(review.status).toBe("playing");
    expect(review.away).toBe(1);
  });

  test("still wins once a route is complete, counting extra beyond N", () => {
    const review = reviewGame(graph, playUnder(unlimited, ...farOff, "Kommun A", "Kommun B"));
    expect(review.status).toBe("won");
    expect(review.extra).toBe(6);
  });
});

describe("giving up", () => {
  const freePlay: Rules = { guessLimit: "distance", giveUp: true, keepsTime: false };

  test("is allowed from the start, before any guess, and ends the trip as a loss", () => {
    const fresh = playUnder(freePlay);
    expect(reviewGame(graph, fresh).canGiveUp).toBe(true);
    const review = reviewGame(graph, giveUp(graph, fresh));
    expect(review.status).toBe("lost");
    expect(review.givenUp).toBe(true);
    expect(review.away).toBe(2);
    expect(review.missing).toEqual(["A", "B"]);
    expect(review.canGiveUp).toBe(false);
  });

  test("is allowed after fewer guesses than the distance", () => {
    const game = playUnder(freePlay, "Kommun Z");
    expect(reviewGame(graph, game).canGiveUp).toBe(true);
    expect(reviewGame(graph, giveUp(graph, game)).status).toBe("lost");
  });

  test("is never allowed under rules without it, as in a daily trip", () => {
    const game = play("Kommun Z", "Kommun A", "Kommun P");
    expect(reviewGame(graph, game).canGiveUp).toBe(false);
    expect(giveUp(graph, game)).toBe(game);
  });

  test("is not allowed once the trip is over", () => {
    const won = playUnder(freePlay, "Kommun A", "Kommun B");
    expect(reviewGame(graph, won).canGiveUp).toBe(false);
    expect(reviewGame(graph, giveUp(graph, won)).status).toBe("won");
  });

  test("works without a guess limit too, where it is the only loss", () => {
    const unlimited: Rules = { guessLimit: "none", giveUp: true, keepsTime: false };
    const game = playUnder(unlimited, "Kommun Z", "Kommun F", "Kommun W1", "Kommun W2");
    expect(reviewGame(graph, giveUp(graph, game)).status).toBe("lost");
  });

  test("a given-up trip takes no more guesses", () => {
    const givenUp = giveUp(graph, playUnder(freePlay, "Kommun Z", "Kommun A"));
    expect(submitGuess(graph, givenUp, "Kommun B")).toMatchObject({ reason: "game-over" });
  });
});

describe("rejected guesses", () => {
  test.each([
    ["Kommun X", "unknown"],
    ["Kommun A", "repeat"],
    ["kommun a", "repeat"],
    ["Kommun S", "endpoint"],
    ["Kommun D", "endpoint"],
  ] as const)("%p is rejected as %p without being counted", (input, reason) => {
    const game = play("Kommun A");
    const result = submitGuess(graph, game, input);
    expect(result).toEqual({ kind: "rejected", reason, input });
    expect(reviewGame(graph, game).cards).toHaveLength(1);
  });

  test("guesses after a win are rejected", () => {
    const result = submitGuess(graph, play("Kommun A", "Kommun B"), "Kommun P");
    expect(result).toMatchObject({ kind: "rejected", reason: "game-over" });
  });

  test("guesses after a loss are rejected", () => {
    const lost = play("Kommun Z", "Kommun F", "Kommun W1", "Kommun W2", "Kommun W3", "Kommun A");
    expect(submitGuess(graph, lost, "Kommun B")).toMatchObject({
      kind: "rejected",
      reason: "game-over",
    });
  });
});
