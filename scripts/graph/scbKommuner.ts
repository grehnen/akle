import { unzipSync, strFromU8 } from "fflate";
import type { Kommun } from "../../src/graph/graphVersion";

const codeColumn = "C";
const nameColumn = "D";

/** The kommuner listed in SCB's `knkopplingar_<year>.xlsx` (code in column C, name in D). */
export function readScbKommunWorkbook(xlsx: Uint8Array): Kommun[] {
  const files = unzipSync(xlsx, {
    filter: (file) =>
      file.name === "xl/worksheets/sheet1.xml" || file.name === "xl/sharedStrings.xml",
  });
  const sheet = files["xl/worksheets/sheet1.xml"];
  const sharedStrings = files["xl/sharedStrings.xml"];
  if (!sheet || !sharedStrings) throw new Error("SCB workbook is missing its first sheet");
  return parseScbKommunSheet(strFromU8(sheet), strFromU8(sharedStrings));
}

/** Rows whose code column holds a four-digit kommun code. */
export function parseScbKommunSheet(sheetXml: string, sharedStringsXml: string): Kommun[] {
  const strings = [...sharedStringsXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
    decodeXml(match[1].replace(/<[^>]+>/g, "")),
  );
  const kommuner: Kommun[] = [];
  for (const row of sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = new Map<string, string>();
    for (const cell of row[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const value = /<v>([\s\S]*?)<\/v>/.exec(cell[3] ?? "")?.[1];
      if (value === undefined) continue;
      cells.set(cell[1], /\bt="s"/.test(cell[2]) ? strings[Number(value)] : decodeXml(value));
    }
    const code = cells.get(codeColumn)?.trim();
    const name = cells.get(nameColumn)?.trim();
    if (code && name && /^\d{4}$/.test(code)) kommuner.push({ code, name });
  }
  return kommuner;
}

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
