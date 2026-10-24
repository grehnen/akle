import { describe, expect, test } from "bun:test";
import { buildGraphVersion } from "../graph/graphVersion";
import { mapDescription } from "./mapDescription";

const graph = buildGraphVersion({
  id: "test",
  startsAtTrip: 1,
  kommuner: [
    { code: "0192", name: "Nynäshamn" },
    { code: "0181", name: "Södertälje" },
    { code: "0488", name: "Trosa" },
    { code: "0136", name: "Haninge" },
    { code: "0128", name: "Salem" },
  ],
  links: [],
});

const trip = { start: "0192", destination: "0488" };

describe("mapDescription", () => {
  test("before any guess, names the start and destination by colour", () => {
    expect(mapDescription(graph, trip, [])).toBe(
      "Start (gul): Nynäshamn. Mål (blå): Trosa. Anslutna gissningar: inga. Gissningar som inte är anslutna: inga. Inga ledtrådskonturer.",
    );
  });

  test("lists the connected guesses and the others, in guess order", () => {
    const cards = [
      { code: "0136", connected: false },
      { code: "0181", connected: true },
      { code: "0128", connected: false },
    ];
    expect(mapDescription(graph, trip, cards)).toBe(
      "Start (gul): Nynäshamn. Mål (blå): Trosa. Anslutna gissningar: Södertälje. Gissningar som inte är anslutna: Haninge, Salem. Inga ledtrådskonturer.",
    );
  });

  test("counts the hint outlines drawn, leaving out kommuner already shown", () => {
    const cards = [{ code: "0136", connected: false }];
    expect(mapDescription(graph, trip, cards, ["0181"])).toEndWith(" 1 ledtrådskontur.");
    expect(mapDescription(graph, trip, cards, ["0181", "0192", "0488", "0136", "0128"])).toEndWith(
      " 2 ledtrådskonturer.",
    );
  });

  test("once finished, says every kommun is outlined instead of counting hint outlines", () => {
    expect(mapDescription(graph, trip, [], ["0181"], { allOutlines: true })).toEndWith(
      " Alla kommuners konturer visas.",
    );
  });
});
