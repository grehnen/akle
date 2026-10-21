/**
 * Parses the simple CSV the data files use: a fixed header line, then rows of exactly that many
 * non-empty, unquoted fields. Blank lines are skipped. `toRow` may throw for a bad row; errors
 * name `fileName` and the line.
 */
export function readCsv<Row = string[]>(
  csv: string,
  header: string,
  fileName: string,
  toRow: (fields: string[]) => Row = (fields) => fields as Row,
): Row[] {
  const lines = csv.split(/\r?\n/);
  if (lines[0] !== header) {
    throw new Error(`${fileName} header must be "${header}", got "${lines[0]}"`);
  }
  const columns = header.split(",").length;
  return lines.slice(1).flatMap((line, index) => {
    if (line === "") return [];
    const where = `${fileName} line ${index + 2}`;
    const fields = line.split(",");
    if (fields.length !== columns || fields.some((field) => field === "")) {
      throw new Error(`${where}: expected ${columns} fields, got "${line}"`);
    }
    try {
      return [toRow(fields)];
    } catch (error) {
      throw new Error(`${where}: ${(error as Error).message}`, { cause: error });
    }
  });
}
