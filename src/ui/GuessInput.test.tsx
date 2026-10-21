import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GuessInput } from "./GuessInput";

const noop = () => {};

describe("GuessInput", () => {
  test("shows disabled suggestions tagged and marked as not pickable", () => {
    const markup = renderToStaticMarkup(
      <GuessInput
        text="o"
        suggestions={[
          { code: "1880", name: "Örebro" },
          { code: "0305", name: "Håbo", disabled: "start" },
          { code: "0180", name: "Stockholm", disabled: "mål" },
          { code: "0139", name: "Upplands-Bro", disabled: "redan gissad" },
        ]}
        highlighted="1880"
        counter="Gissa (1/5)"
        onEvent={noop}
      />,
    );

    expect(markup).toContain('role="combobox"');
    expect(markup).toContain('aria-activedescendant="suggestion-1880"');
    expect(markup).toMatch(/<li[^>]*id="suggestion-1880"[^>]*aria-selected="true"/);
    for (const [code, tag] of [
      ["0305", "start"],
      ["0180", "mål"],
      ["0139", "redan gissad"],
    ]) {
      expect(markup).toMatch(
        new RegExp(`<li[^>]*id="suggestion-${code}"[^>]*aria-disabled="true"[^>]*>.*?${tag}`),
      );
    }
    expect(markup).toContain("Gissa (1/5)");
  });

  test("shows no list without suggestions", () => {
    const markup = renderToStaticMarkup(
      <GuessInput text="" suggestions={[]} counter="Gissa (0/5)" onEvent={noop} />,
    );
    expect(markup).not.toContain('role="listbox"');
    expect(markup).toContain('aria-expanded="false"');
  });

  test("the keyboard's Enter key says send for an exact match and next otherwise", () => {
    const render = (exactMatch: boolean) =>
      renderToStaticMarkup(
        <GuessInput
          text="Örebro"
          exactMatch={exactMatch}
          suggestions={[]}
          counter="Gissa (0/5)"
          onEvent={noop}
        />,
      );
    expect(render(true)).toContain('enterKeyHint="send"');
    expect(render(false)).toContain('enterKeyHint="next"');
  });

  test("the keyboard doesn't autocorrect or spellcheck kommun names", () => {
    const markup = renderToStaticMarkup(
      <GuessInput text="" suggestions={[]} counter="Gissa (0/5)" onEvent={noop} />,
    );
    expect(markup).toContain('autoCorrect="off"');
    expect(markup).toContain('spellCheck="false"');
  });
});
