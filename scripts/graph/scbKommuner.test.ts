import { describe, expect, test } from "bun:test";
import { parseScbKommunSheet } from "./scbKommuner";

const sharedStrings = `<sst><si><t>Kommunkod</t></si><si><t>Kommun</t></si><si><t>0114</t></si><si><t>Upplands Väsby</t></si><si><t>0980</t></si><si><t>Gotland</t></si><si><t xml:space="preserve">Stockholm</t></si></sst>`;

const sheet = `<worksheet><sheetData>
<row r="8"><c r="A8" t="s"><v>0</v></c><c r="C8" t="s"><v>0</v></c><c r="D8" t="s"><v>1</v></c></row>
<row r="14"><c r="A14"><v>1</v></c><c r="B14" t="s"><v>6</v></c><c r="C14" t="s"><v>2</v></c><c r="D14" t="s"><v>3</v></c></row>
<row r="15"><c r="C15" t="s"><v>4</v></c><c r="D15" t="s"><v>5</v></c><c r="E15"/></row>
</sheetData></worksheet>`;

describe("parseScbKommunSheet", () => {
  test("reads the kommun code and name columns, skipping header rows", () => {
    expect(parseScbKommunSheet(sheet, sharedStrings)).toEqual([
      { code: "0114", name: "Upplands Väsby" },
      { code: "0980", name: "Gotland" },
    ]);
  });
});
