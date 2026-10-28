import { describe, expect, test } from "bun:test";
import { copyShareText } from "./copyShareText";

describe("copying the share text", () => {
  test("writes the text to the clipboard and says Kopierat!", async () => {
    const written: string[] = [];
    const clipboard = { writeText: async (text: string) => void written.push(text) };

    expect(await copyShareText(clipboard, "#åkle #1 +0 (Perfekt)")).toEqual({
      copied: true,
      message: "Kopierat!",
    });
    expect(written).toEqual(["#åkle #1 +0 (Perfekt)"]);
  });

  test("says so when the clipboard refuses", async () => {
    const clipboard = { writeText: () => Promise.reject(new Error("denied")) };
    expect(await copyShareText(clipboard, "text")).toEqual({
      copied: false,
      message: "Kunde inte kopiera",
    });
  });

  test("says so when there is no clipboard", async () => {
    expect(await copyShareText(undefined, "text")).toEqual({
      copied: false,
      message: "Kunde inte kopiera",
    });
  });
});
